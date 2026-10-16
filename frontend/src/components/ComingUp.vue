<script setup>
import {computed} from 'vue';
import AppIcon from './AppIcon.vue';
import {useDetailStore} from '../stores/useDetailStore.js';

const detail = useDetailStore();

/**
 * This week's episodes (Sonarr) and film releases (Radarr), grouped by day.
 * Already-downloaded items are marked; times are local.
 */
const props = defineProps({
  data: {type: Object, default: null},
  loading: {type: Boolean, default: false},
});

const dayFmt = new Intl.DateTimeFormat('en-GB', {weekday: 'long', day: 'numeric', month: 'short'});
const timeFmt = new Intl.DateTimeFormat('nl-NL', {hour: '2-digit', minute: '2-digit'});

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d) {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (dayKey(d) === dayKey(today)) return 'Today';
  if (dayKey(d) === dayKey(tomorrow)) return 'Tomorrow';
  return dayFmt.format(d);
}

const configured = computed(() => props.data?.configured?.sonarr || props.data?.configured?.radarr);

const shortDay = new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric'});

/* Every day of the window, empty ones included, so the week reads as a
   calendar strip on wide screens. */
const days = computed(() => {
  const count = props.data?.days || 7;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const list = Array.from({length: count}, (_, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    const label = dayLabel(d);
    return {key: dayKey(d), label, short: i < 2 ? label : shortDay.format(d), items: []};
  });
  const byKey = new Map(list.map((day) => [day.key, day]));
  for (const item of props.data?.items || []) {
    const d = new Date(item.at);
    // A film "released" on a date is shown on that local date.
    byKey.get(dayKey(d))?.items.push({...item, time: item.allDay ? '' : timeFmt.format(d)});
  }
  return list;
});

const busyDays = computed(() => days.value.filter((d) => d.items.length));
const quietWeek = computed(() => !busyDays.value.length);

const nextFmt = new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', month: 'short'});
const next = computed(() => {
  const n = props.data?.next;
  if (!n) return null;
  return {...n, when: nextFmt.format(new Date(n.at))};
});

const failures = computed(() =>
  (props.data?.failed || []).map((f) => {
    const service = typeof f === 'string' ? f : f.service;
    return {
      key: service,
      text: `${service === 'sonarr' ? 'Sonarr' : 'Radarr'}: ${typeof f === 'string' ? "couldn't connect" : f.reason}`,
    };
  })
);
</script>

<template>
  <section class="settle">
    <header class="mb-4 flex items-baseline justify-between gap-4">
      <h2 class="t-section">Coming up</h2>
      <p v-if="configured && !loading" class="t-note">next {{ data?.days || 7 }} days</p>
    </header>

    <div v-if="loading" class="panel p-4" aria-busy="true" aria-label="Loading upcoming releases">
      <div v-for="g in 2" :key="g" class="mb-4 last:mb-0" aria-hidden="true">
        <span class="skeleton mb-3 block h-3 w-24"></span>
        <div v-for="r in 2" :key="r" class="flex items-center gap-3 py-2">
          <span class="skeleton h-12 w-8 rounded-[5px]"></span>
          <span class="flex flex-1 flex-col gap-1.5">
            <span class="skeleton h-3.5 w-2/5"></span>
            <span class="skeleton h-3 w-3/5"></span>
          </span>
        </div>
      </div>
    </div>

    <div v-else-if="!configured" class="panel p-5">
      <p class="t-body text-ink">Connect Sonarr and Radarr to see this week's releases.</p>
      <p class="mt-1.5 t-note">
        Add <span class="text-dim">SONARR_URL</span>, <span class="text-dim">SONARR_API_KEY</span>,
        <span class="text-dim">RADARR_URL</span> and <span class="text-dim">RADARR_API_KEY</span> to
        <span class="text-dim">.env</span>. The keys are under Settings › General in each app.
      </p>
    </div>

    <div v-else class="reveal panel">
      <ul v-if="failures.length" class="flex flex-col gap-1 border-b border-line-soft px-4 py-2.5">
        <li v-for="f in failures" :key="f.key" class="flex items-center gap-2 t-note"><span class="dot dot-warn"></span>{{ f.text }}</li>
      </ul>

      <!-- A week with nothing in it: one line, and what comes after. -->
      <div v-if="quietWeek" class="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <p class="t-body text-dim">Nothing new in the next {{ data?.days || 7 }} days.</p>
        <button v-if="next" type="button" class="upcoming-item press -m-1.5 flex min-w-0 items-center gap-3 rounded-md p-1.5 text-left" @click="detail.open('upcoming', next, $event)">
          <span class="well aspect-[2/3] w-8 shrink-0 overflow-hidden rounded-[5px]">
            <img v-if="next.poster" :src="next.poster" alt="" class="h-full w-full object-cover" loading="lazy"/>
          </span>
          <span class="min-w-0">
            <span class="block truncate text-[0.875rem] text-ink">Next up: {{ next.title }}</span>
            <span class="block truncate t-note text-[0.75rem]">{{ next.subtitle }} · {{ next.when }}</span>
          </span>
        </button>
        <p v-else class="t-note">Nothing scheduled in the next {{ data?.lookahead || 60 }} days either.</p>
      </div>

      <!-- Wide: the week as seven columns. -->
      <div v-if="!quietWeek" class="hidden divide-x divide-line-soft lg:grid" :style="{gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`}">
        <div v-for="day in days" :key="day.key" class="min-w-0 px-3 pb-4 pt-3">
          <h3 class="mb-2 truncate text-[0.75rem] font-semibold" :class="day.label === 'Today' ? 'text-ink' : 'text-dim'">{{ day.short }}</h3>
          <p v-if="!day.items.length" class="text-[0.75rem] text-faint">–</p>
          <ul v-if="day.items.length" class="flex flex-col gap-3">
            <li v-for="item in day.items" :key="item.id" class="min-w-0">
              <button type="button" class="upcoming-item press -m-1.5 flex w-[calc(100%+0.75rem)] min-w-0 gap-2.5 rounded-md p-1.5 text-left" :title="`${item.title} · ${item.subtitle}`" @click="detail.open('upcoming', item, $event)">
              <span class="well aspect-[2/3] w-8 shrink-0 overflow-hidden rounded-[5px]">
                <img v-if="item.poster" :src="item.poster" alt="" class="h-full w-full object-cover" loading="lazy"/>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[0.8125rem] leading-tight text-ink">{{ item.title }}</span>
                <span class="mt-0.5 block truncate text-[0.6875rem] text-faint">{{ item.subtitle }}</span>
                <span class="mt-0.5 flex items-center gap-1 text-[0.6875rem] tabular-nums text-dim">
                  <span v-if="item.time">{{ item.time }}</span>
                  <span v-if="item.hasFile" class="flex items-center gap-0.5 text-live"><AppIcon :size="12" name="download"/>ready</span>
                </span>
              </span>
            </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Narrow: only the days with something on them, as a list. -->
      <div v-if="!quietWeek" class="px-4 py-2 lg:hidden">
        <div v-for="day in busyDays" :key="day.key" class="border-b border-line-soft py-2 last:border-b-0">
          <h3 class="pb-1 pt-1 text-[0.75rem] font-semibold text-dim">{{ day.label }}</h3>
          <ul>
            <li v-for="item in day.items" :key="item.id">
              <button type="button" class="upcoming-item press -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-1.5 text-left" @click="detail.open('upcoming', item, $event)">
              <span class="well aspect-[2/3] w-8 shrink-0 overflow-hidden rounded-[5px]">
                <img v-if="item.poster" :src="item.poster" alt="" class="h-full w-full object-cover" loading="lazy"/>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[0.875rem] text-ink">{{ item.title }}</span>
                <span class="block truncate t-note text-[0.75rem]">{{ item.subtitle }}</span>
              </span>
              <span v-if="item.hasFile" class="flex shrink-0 items-center text-live" title="Already downloaded">
                <AppIcon :size="14" name="download"/>
                <span class="sr-only">Downloaded</span>
              </span>
              <span class="w-12 shrink-0 text-right text-[0.75rem] tabular-nums text-faint">{{ item.time }}</span>
            </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.upcoming-item {
  transition: background-color 120ms var(--ease);
}

.upcoming-item:hover {
  background: rgb(var(--line-soft-rgb) / 0.6);
}

.upcoming-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
