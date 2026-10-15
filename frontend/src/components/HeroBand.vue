<script setup>
import {computed, ref, watch} from 'vue';
import AppIcon from './AppIcon.vue';
import RollingNumber from './RollingNumber.vue';
import WeatherBackdrop from './WeatherBackdrop.vue';
import SegmentedControl from './SegmentedControl.vue';
import {describeRain} from '../composables/rainSummary.js';

const props = defineProps({
  clock: {type: String, default: ''},
  date: {type: String, default: ''},
  here: {type: Object, default: null},
  away: {type: Object, default: null},
  outlook: {type: Object, default: null},
  isLoading: {type: Boolean, default: false},
});

/* OpenWeather's icon code is only used to pick a glyph from our own set. */
function iconFor(code = '') {
  if (code.startsWith('01')) return code.endsWith('n') ? 'moon' : 'sun';
  if (code.startsWith('02')) return code.endsWith('n') ? 'cloudMoon' : 'cloudSun';
  if (code.startsWith('03') || code.startsWith('04')) return 'cloud';
  if (code.startsWith('09') || code.startsWith('10')) return 'rain';
  if (code.startsWith('11')) return 'storm';
  if (code.startsWith('13')) return 'snow';
  if (code.startsWith('50')) return 'fog';
  return 'cloud';
}

const condIcon = computed(() => iconFor(props.here?.icon || ''));

const hours = computed(() => (props.clock || '').split(':')[0] || '--');
const minutes = computed(() => (props.clock || '').split(':')[1] || '--');

const meta = computed(() => {
  const h = props.here;
  if (!h) return '';
  const parts = [h.city];
  if (h.feelsLike != null) parts.push(`feels ${h.feelsLike}°`);
  if (h.windSpeed != null) parts.push(`wind ${h.windSpeed} km/h${h.windDirection ? ` ${h.windDirection}` : ''}`);
  return parts.join(', ');
});

const rain = computed(() => props.outlook?.rain || null);
const rainNow = computed(() => rain.value?.slots?.[0]?.mm || 0);

/* How far ahead the rain bars look: 1, 2 or 3 hours (3 only when Buienradar
   sent that much). Remembered per browser. */
const WINDOW_KEY = 'dashboard.rainWindow';
function readWindow() {
  try {
    return localStorage.getItem(WINDOW_KEY) || '2';
  } catch {
    return '2';
  }
}
const rainWindow = ref(readWindow());
watch(rainWindow, (value) => {
  try {
    localStorage.setItem(WINDOW_KEY, value);
  } catch {
    // Private mode or blocked storage: the choice just won't stick.
  }
});

const windowOptions = computed(() => {
  const n = rain.value?.slots?.length || 0;
  return [
    {value: '1', label: '1 h'},
    {value: '2', label: '2 h'},
    ...(n >= 36 ? [{value: '3', label: '3 h'}] : []),
  ];
});

const activeWindow = computed(() =>
  windowOptions.value.some((o) => o.value === rainWindow.value) ? rainWindow.value : '2'
);

const shownSlots = computed(() => (rain.value?.slots || []).slice(0, Number(activeWindow.value) * 12));
const windowLabel = computed(() => (activeWindow.value === '1' ? 'next hour' : `next ${activeWindow.value} hours`));
const rainSummary = computed(() => describeRain(shownSlots.value, windowLabel.value) || rain.value?.summary);

/* Rain on a log-ish scale so a drizzle still shows and a downpour doesn't
   swamp everything else: 0.1 mm/h is a short bar, 4 mm/h fills the track. */
const rainBars = computed(() =>
  shownSlots.value.map((slot) => {
    const wet = slot.mm >= 0.1;
    const level = wet ? Math.min(1, Math.log10(1 + slot.mm) / Math.log10(5)) : 0;
    return {
      key: slot.time,
      wet,
      height: wet ? Math.round(6 + level * 50) : 2,
      label: wet ? `${slot.time}, ${slot.mm.toFixed(1)} mm/h` : `${slot.time}, dry`,
    };
  })
);

const rainTicks = computed(() => {
  const slots = shownSlots.value;
  if (!slots.length) return [];
  const quarter = slots.length / 4;
  return [0, 1, 2, 3]
      .map((q) => Math.round(q * quarter))
      .filter((i) => i < slots.length)
      .map((i) => ({key: i, left: `${(i / slots.length) * 100}%`, text: i === 0 ? 'Now' : slots[i].time}));
});

const forecast = computed(() =>
  (props.outlook?.hours || []).map((h) => ({
    ...h,
    glyph: iconFor(h.icon || ''),
    rainText: h.rainChance != null && h.rainChance >= 20 ? `${h.rainChance}% rain` : 'dry',
    rainy: h.rainChance != null && h.rainChance >= 20,
  }))
);
</script>

<template>
  <section class="settle relative overflow-hidden px-6 pb-10 pt-10 md:px-10 md:pb-12 md:pt-14">
    <WeatherBackdrop
        v-if="here"
        :condition-id="here.conditionId"
        :rain-now="rainNow"
        :wind-speed="here.windSpeed"
    />

    <div class="relative flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-14">

      <!-- Time, the thing you are most often here to read. -->
      <div class="min-w-0">
        <h1 class="t-hero t-read flex items-baseline">
          <RollingNumber :value="hours" digit-width="0.57em" fallback="--"/>
          <span class="mx-[-0.015em] text-faint">:</span>
          <RollingNumber :value="minutes" digit-width="0.57em" fallback="--"/>
        </h1>
        <p class="mt-3 text-[1.0625rem] tracking-[-0.015em] text-dim">{{ date }}</p>
      </div>

      <div v-if="isLoading" class="h-56 w-full max-w-[40rem] animate-pulse rounded-lg bg-raised/60"></div>

      <div v-else-if="here" class="flex w-full max-w-[40rem] flex-col gap-7">

        <!-- Now -->
        <div class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div class="flex items-end gap-4">
            <span class="t-read text-[3rem] font-semibold leading-[0.9] tracking-[-0.04em] md:text-[3.5rem]">
              <RollingNumber :value="here.temperature" suffix="°"/>
            </span>
            <div class="pb-0.5">
              <p class="flex items-center gap-2 text-[1.125rem] tracking-[-0.015em] text-ink first-letter:uppercase">
                <AppIcon :size="18" class="text-dim" :name="condIcon"/>
                <span class="first-letter:uppercase">{{ here.condition }}</span>
              </p>
              <p class="mt-1 t-note">{{ meta }}</p>
            </div>
          </div>

          <dl class="flex gap-5 t-note">
            <div v-if="here.sunrise" class="flex items-center gap-1.5">
              <dt><AppIcon :size="16" name="sunrise"/><span class="sr-only">Sunrise</span></dt>
              <dd class="t-read text-dim">{{ here.sunrise }}</dd>
            </div>
            <div v-if="here.sunset" class="flex items-center gap-1.5">
              <dt><AppIcon :size="16" name="sunset"/><span class="sr-only">Sunset</span></dt>
              <dd class="t-read text-dim">{{ here.sunset }}</dd>
            </div>
            <div v-if="away && away.city !== here.city" class="flex items-center gap-1.5">
              <dt>{{ away.city }}</dt>
              <dd class="t-read text-dim">{{ away.temperature }}°</dd>
            </div>
          </dl>
        </div>

        <!-- Rain, next two hours -->
        <div v-if="rain?.available">
          <div class="flex items-center justify-between gap-4">
            <p class="text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{{ rainSummary }}</p>
            <SegmentedControl
                :model-value="activeWindow"
                @update:model-value="rainWindow = $event"
                :options="windowOptions"
                size="sm"
                label="How far ahead to show rain"
            />
          </div>
          <div
              class="mt-3 flex h-14 items-end gap-[3px] border-b border-line"
              role="img"
              :aria-label="rainSummary"
          >
            <span
                v-for="bar in rainBars"
                :key="bar.key"
                class="rain-bar flex-1 rounded-t-[3px]"
                :class="bar.wet ? 'bg-accent' : 'bg-line'"
                :style="{height: `${bar.height}px`}"
                :title="bar.label"
            ></span>
          </div>
          <div class="relative mt-2 h-4 t-note text-[0.75rem]">
            <span
                v-for="tick in rainTicks"
                :key="tick.key"
                class="t-read absolute top-0"
                :style="{left: tick.left}"
            >{{ tick.text }}</span>
          </div>
        </div>

        <!-- Next 12 hours -->
        <ol v-if="forecast.length" class="grid grid-cols-5 gap-2">
          <li
              v-for="slot in forecast"
              :key="slot.time"
              class="flex min-w-0 flex-col gap-2 rounded-md bg-raised/70 px-2.5 py-3 backdrop-blur-sm sm:px-3"
          >
            <span class="flex items-center justify-between gap-1">
              <span class="t-read t-note text-[0.75rem]">{{ slot.time }}</span>
              <AppIcon :size="17" class="shrink-0 text-dim" :name="slot.glyph"/>
            </span>
            <span class="t-read text-[1.25rem] font-semibold tracking-[-0.02em] text-ink">{{ slot.temperature }}°</span>
            <span class="truncate text-[0.75rem]" :class="slot.rainy ? 'text-accent' : 'text-faint'">
              <template v-if="slot.rainy">{{ slot.rainChance }}%<span class="hidden sm:inline"> rain</span></template>
              <template v-else>dry</template>
            </span>
          </li>
        </ol>
      </div>

      <p v-else class="t-note">Weather unavailable</p>
    </div>
  </section>
</template>

<style scoped>
.rain-bar {
  transition: height 600ms var(--ease);
}

@media (prefers-reduced-motion: reduce) {
  .rain-bar {
    transition: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  li {
    backdrop-filter: none;
    background: rgb(var(--raised-rgb));
  }
}
</style>
