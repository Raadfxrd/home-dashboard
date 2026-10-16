<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import {RouterLink} from 'vue-router';
import HeroBand from '../components/HeroBand.vue';
import SystemReadout from '../components/SystemReadout.vue';
import DownloadList from '../components/DownloadList.vue';
import MediaRail from '../components/MediaRail.vue';
import StatusStrip from '../components/StatusStrip.vue';
import AppIcon from '../components/AppIcon.vue';
import NowPlaying from '../components/NowPlaying.vue';
import ComingUp from '../components/ComingUp.vue';
import IdleScreen from '../components/IdleScreen.vue';
import SegmentedControl from '../components/SegmentedControl.vue';
import {useIdle} from '../composables/useIdle.js';
import AgendaList from '../components/AgendaList.vue';
import {outingWindow, planFor} from '../composables/dayPlan.js';
import {useWeatherStore} from '../stores/useWeatherStore.js';
import {useHomeStore} from '../stores/useHomeStore.js';
import {useJellyfinStore} from '../stores/useJellyfinStore.js';
import {useGeolocation} from '../composables/useGeolocation.js';

const weatherStore = useWeatherStore();
const homeStore = useHomeStore();
const jellyfinStore = useJellyfinStore();

const {coords, isLoading: geoLoading} = useGeolocation();

const POLL_MS = Math.max(1500, Math.min(60000, Number(import.meta.env.VITE_DASHBOARD_POLL_INTERVAL_MS || 5000)));
const JELLYFIN_REFRESH_MS = 30 * 60 * 1000;
const WEATHER_REFRESH_MS = 5 * 60 * 1000;

const clock = ref('');
const nowMs = ref(Date.now());
const today = ref('');
const jellyfinKey = ref(0);


let clockTimer = null;
let scheduleTimer = null;

const {idle, after: idleAfter, wake} = useIdle();

/* Everything that refreshes, with how often while someone is looking and
   while the screen is idle (null: not at all, because the idle screen
   doesn't show it). On waking, anything overdue refreshes at once. */
const tasks = [
  {run: () => homeStore.fetchServiceStatus(), active: POLL_MS, idle: 60000},
  {run: () => homeStore.fetchSystemHistory(), active: () => (homeStore.historyRange === '24h' ? 60000 : 15000), idle: null},
  {run: () => jellyfinStore.fetchNowPlaying(), active: 10000, idle: null},
  {run: () => homeStore.fetchContainers(), active: 20000, idle: null},
  {run: () => homeStore.fetchLog(), active: 30000, idle: 300000},
  {run: () => homeStore.fetchUpcoming(), active: 30 * 60000, idle: null},
  {run: () => homeStore.fetchCalendar(), active: 10 * 60000, idle: 30 * 60000},
  {run: refreshJellyfin, active: JELLYFIN_REFRESH_MS, idle: null},
  {
    run: () => {
      weatherStore.fetchAmsterdamWeather();
      weatherStore.fetchOutlook();
    },
    active: WEATHER_REFRESH_MS,
    idle: WEATHER_REFRESH_MS,
  },
].map((task) => ({...task, last: 0}));

function tick() {
  const now = Date.now();
  for (const task of tasks) {
    const every = idle.value ? task.idle : typeof task.active === 'function' ? task.active() : task.active;
    if (every && now - task.last >= every) {
      task.last = now;
      task.run();
    }
  }
}

watch(idle, (isIdle) => {
  if (!isIdle) tick();
});

/* A new range needs its history now, not at the next tick. */
function pollHistory() {
  tasks[1].last = Date.now();
  homeStore.fetchSystemHistory();
}

function setRange(range) {
  homeStore.historyRange = range;
  pollHistory();
}

function updateClock() {
  const now = new Date();
  clock.value = now.toLocaleTimeString('nl-NL', {hour: '2-digit', minute: '2-digit'});
  // Minute precision is plenty for the agenda and the what-to-wear window.
  if (now.getTime() - nowMs.value >= 60000) nowMs.value = now.getTime();
  today.value = now.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long'});
}

async function refreshJellyfin() {
  await Promise.all([
    jellyfinStore.fetchSuggestedWatches(),
    jellyfinStore.fetchRecommendedShows(),
    jellyfinStore.fetchRecentlyAdded(),
  ]);
  jellyfinKey.value += 1;
}

/* Suggested films and shows are one shelf as far as the viewer is concerned,
   so merge them, de-duplicate, and shuffle so it isn't the same six every day. */
const suggested = computed(() => {
  const merged = [...(jellyfinStore.suggestedWatches || []), ...(jellyfinStore.recommendedShows || [])];
  const byId = new Map();
  for (const item of merged) {
    const key = item?.id ?? item?.Id ?? `${item?.title || 'item'}_${byId.size}`;
    if (!byId.has(key)) byId.set(key, item);
  }
  const list = Array.from(byId.values());
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
});

const suggestedLoading = computed(
    () => jellyfinStore.suggestedLoading || jellyfinStore.recommendedShowsLoading
);
const suggestedError = computed(
    () => jellyfinStore.suggestedError || jellyfinStore.recommendedShowsError
);

const nas = computed(() => homeStore.serviceStatus.nasMetrics);

/* What to wear: for your next appointment somewhere, otherwise the next few
   hours (or tomorrow, late in the evening). */
// Room under the clock: each stream card takes about three agenda rows.
const agendaBudget = computed(() => Math.max(4, 11 - 3 * Math.min(2, jellyfinStore.nowPlaying.length)));

const wearPlan = computed(() =>
  planFor(outingWindow(homeStore.calendar?.events || [], nowMs.value), {
    here: weatherStore.amsterdamWeather,
    outlook: weatherStore.outlook,
  })
);

watch(coords, (val) => {
  if (val) weatherStore.fetchLocationWeather(val.lat, val.lon);
});


onMounted(() => {
  updateClock();
  clockTimer = setInterval(updateClock, 1000);
  tick();
  scheduleTimer = setInterval(tick, 1000);
});

onUnmounted(() => {
  clearInterval(clockTimer);
  clearInterval(scheduleTimer);
});
</script>

<template>
  <div class="relative z-10 flex min-h-dvh flex-col overflow-x-clip">

    <!-- The one translucent layer in the interface. Content runs under it. -->
    <header class="chrome sticky top-0 z-30 border-b border-line-soft">
      <div class="mx-auto flex max-w-[1560px] items-center justify-between gap-4 px-5 py-3 md:px-9">
        <span class="flex items-center gap-2.5">
          <AppIcon :size="17" class="text-dim" name="home"/>
          <span class="text-[0.875rem] font-medium tracking-[-0.01em] text-ink">Home</span>
        </span>
        <RouterLink class="link-quiet press flex items-center gap-1.5 text-[0.875rem]" to="/media/movies">
          Library
          <AppIcon :size="15" name="arrow"/>
        </RouterLink>
      </div>
    </header>

    <div class="mx-auto w-full max-w-[1560px] flex-1">
      <HeroBand
          :clock="clock"
          :date="today"
          :here="weatherStore.amsterdamWeather"
          :away="weatherStore.locationWeather"
          :outlook="weatherStore.outlook"
          :outlook-loading="weatherStore.outlookLoading"
          :is-loading="weatherStore.isLoading && !weatherStore.amsterdamWeather"
          :plan="wearPlan"
      >
        <template #live>
          <AgendaList :calendar="homeStore.calendar" :now="nowMs" :budget="agendaBudget"/>
          <Transition name="slot">
            <NowPlaying v-if="jellyfinStore.nowPlaying.length" class="mt-auto" compact :sessions="jellyfinStore.nowPlaying"/>
          </Transition>
        </template>
      </HeroBand>

      <!-- A grid that does not rearrange itself as data lands. Everything
           keeps its place so it can be found without reading. -->
      <main class="grid grid-cols-1 gap-x-8 gap-y-10 px-5 pb-14 md:px-9 xl:grid-cols-12">
        <!-- One section per row, full width, in order of how often you look:
             the NAS, downloads, the week, then the library. -->
        <div class="xl:col-span-12">
          <SystemReadout
              :metrics="nas"
              :fallback="homeStore.serviceStatus.nasUsage"
              :history="homeStore.systemHistory"
              :range="homeStore.historyRange"
              :loading="!homeStore.statusLoaded"
              @update:range="setRange"
          />
        </div>

        <div class="xl:col-span-12">
          <DownloadList :activity="homeStore.serviceStatus.downloadActivity" :loading="!homeStore.statusLoaded"/>
        </div>

        <div class="xl:col-span-12">
          <ComingUp :data="homeStore.upcoming" :loading="!homeStore.upcoming"/>
        </div>

        <div class="xl:col-span-12">
          <section class="settle">
            <header class="mb-4 flex items-baseline justify-between gap-4">
              <h2 class="t-section">Watch</h2>
              <RouterLink class="link-quiet text-[0.8125rem]" to="/media/movies">
                Browse library
              </RouterLink>
            </header>

            <div class="space-y-7">
              <MediaRail
                  :key="`suggested-${jellyfinKey}`"
                  :is-loading="suggestedLoading"
                  :items="suggested"
                  :error="suggestedError"
                  title="Suggested for you"
              />
              <MediaRail
                  :key="`recent-${jellyfinKey}`"
                  :is-loading="jellyfinStore.recentLoading"
                  :items="jellyfinStore.recentlyAdded"
                  :error="jellyfinStore.recentError"
                  title="Recently added"
              />
            </div>
          </section>
        </div>
      </main>
    </div>

    <footer class="border-t border-line-soft px-5 py-5 md:px-9">
      <div class="mx-auto max-w-[1560px]">
        <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <StatusStrip
              :status="homeStore.serviceStatus"
              :containers="homeStore.containers"
              :log="homeStore.logEntries"
              :loading="!homeStore.statusLoaded"
              @clear-log="homeStore.clearLog()"
          />
          <div class="flex items-center gap-2.5 t-note">
            <span aria-hidden="true">Idle screen after</span>
            <SegmentedControl
                v-model="idleAfter"
                :options="[{value: '2', label: '2 min'}, {value: '5', label: '5 min'}, {value: '10', label: '10 min'}, {value: 'off', label: 'Off'}]"
                size="sm"
                label="Idle screen after"
            />
          </div>
        </div>
      </div>
    </footer>

    <Transition name="idle">
      <IdleScreen
          v-if="idle"
          :clock="clock"
          :date="today"
          :here="weatherStore.amsterdamWeather"
          :outlook="weatherStore.outlook"
          @wake="wake"
      />
    </Transition>
  </div>
</template>

<style scoped>
/* Eases into the idle screen slowly; snaps back quickly when touched. */
.idle-enter-active {
  transition: opacity 1.2s var(--ease);
}

.idle-leave-active {
  transition: opacity 220ms var(--ease);
}

.idle-enter-from,
.idle-leave-to {
  opacity: 0;
}

.slot-enter-active,
.slot-leave-active {
  transition: opacity 320ms var(--ease), transform 320ms var(--ease);
}

.slot-enter-from,
.slot-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>

