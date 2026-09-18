<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import {RouterLink} from 'vue-router';
import HeroBand from '../components/HeroBand.vue';
import HomeKitPanel from '../components/HomeKitPanel.vue';
import SystemReadout from '../components/SystemReadout.vue';
import DownloadList from '../components/DownloadList.vue';
import MediaRail from '../components/MediaRail.vue';
import StatusStrip from '../components/StatusStrip.vue';
import AppIcon from '../components/AppIcon.vue';
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
const HISTORY_LIMIT = 48;

const clock = ref('');
const today = ref('');
const jellyfinKey = ref(0);

const cpuHistory = ref([]);
const ramHistory = ref([]);
const rxHistory = ref([]);
const txHistory = ref([]);

let clockTimer = null;
let statusTimer = null;
let jellyfinTimer = null;

function pushHistory(target, value) {
  if (!Number.isFinite(value)) return;
  target.value = [...target.value, value].slice(-HISTORY_LIMIT);
}

function updateClock() {
  const now = new Date();
  clock.value = now.toLocaleTimeString('nl-NL', {hour: '2-digit', minute: '2-digit'});
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

watch(coords, (val) => {
  if (val) weatherStore.fetchLocationWeather(val.lat, val.lon);
});

watch(
    () => ({
      cpu: nas.value.cpu?.usagePercent,
      ram: nas.value.memory?.usedPercent,
      rx: nas.value.network?.totalRxRateBytesPerSecond,
      tx: nas.value.network?.totalTxRateBytesPerSecond,
    }),
    (sample) => {
      pushHistory(cpuHistory, Number(sample.cpu));
      pushHistory(ramHistory, Number(sample.ram));
      pushHistory(rxHistory, Number(sample.rx));
      pushHistory(txHistory, Number(sample.tx));
    },
    {deep: true}
);

onMounted(() => {
  updateClock();
  clockTimer = setInterval(updateClock, 1000);

  weatherStore.fetchAmsterdamWeather();
  homeStore.fetchDevices();
  homeStore.fetchServiceStatus();
  refreshJellyfin();

  statusTimer = setInterval(() => homeStore.fetchServiceStatus(), POLL_MS);
  jellyfinTimer = setInterval(refreshJellyfin, JELLYFIN_REFRESH_MS);
});

onUnmounted(() => {
  clearInterval(clockTimer);
  clearInterval(statusTimer);
  clearInterval(jellyfinTimer);
});
</script>

<template>
  <div class="relative z-10 flex min-h-dvh flex-col">

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
          :is-loading="weatherStore.isLoading && !weatherStore.amsterdamWeather"
      />

      <!-- A grid that does not rearrange itself as data lands. Everything
           keeps its place so it can be found without reading. -->
      <main class="grid grid-cols-1 gap-x-8 gap-y-10 px-5 pb-14 md:px-9 xl:grid-cols-12">
        <div class="xl:col-span-7">
          <HomeKitPanel/>
        </div>

        <div class="xl:col-span-5">
          <SystemReadout
              :metrics="nas"
              :fallback="homeStore.serviceStatus.nasUsage"
              :cpu-history="cpuHistory"
              :ram-history="ramHistory"
              :rx-history="rxHistory"
              :tx-history="txHistory"
          />
        </div>

        <div class="xl:col-span-12">
          <DownloadList :activity="homeStore.serviceStatus.downloadActivity"/>
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
        <StatusStrip :status="homeStore.serviceStatus"/>
      </div>
    </footer>

    <!-- Confirmations, anchored bottom-right, entering and leaving the same way. -->
    <div class="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(92vw,22rem)] flex-col gap-2">
      <TransitionGroup name="toast">
        <div
            v-for="item in homeStore.notifications"
            :key="item.id"
            class="panel chrome flex items-center gap-2.5 px-3.5 py-2.5 text-[0.8125rem] text-ink shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
        >
          <span :class="item.type === 'error' ? 'dot dot-fault' : 'dot dot-live'"></span>
          <span class="min-w-0 flex-1">{{ item.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: transform 340ms var(--ease), opacity 260ms var(--ease);
}

/* In from the right, out to the right — the same path, reversed. */
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(14px);
}

.toast-move {
  transition: transform 340ms var(--ease);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active,
  .toast-move {
    transition: opacity 180ms linear;
  }

  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
