<script setup>
import {computed, onMounted, ref, watch} from 'vue';
import AppIcon from './AppIcon.vue';
import RollingNumber from './RollingNumber.vue';
import WeatherBackdrop from './WeatherBackdrop.vue';
import SegmentedControl from './SegmentedControl.vue';
import WearAdvice from './WearAdvice.vue';
import {useDetailStore} from '../stores/useDetailStore.js';
import {describeRain} from '../composables/rainSummary.js';

const props = defineProps({
  clock: {type: String, default: ''},
  date: {type: String, default: ''},
  here: {type: Object, default: null},
  away: {type: Object, default: null},
  outlook: {type: Object, default: null},
  isLoading: {type: Boolean, default: false},
  outlookLoading: {type: Boolean, default: false},
  plan: {type: Object, default: null},
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

const detail = useDetailStore();

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

/* How far ahead the rain bars look: 2 or 3 hours from the radar (5-minute
   steps; 3 only when Buienradar sent that much), or the next 24 hours from
   the forecast (3-hour steps). Remembered per browser. */
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

const radarSlots = computed(() => (rain.value?.available ? rain.value.slots || [] : []));
const daySlots = computed(() => props.outlook?.day || []);
const hasRain = computed(() => radarSlots.value.length > 0 || daySlots.value.length > 0);

const windowOptions = computed(() => [
  ...(radarSlots.value.length >= 24 ? [{value: '2', label: '2 h'}] : []),
  ...(radarSlots.value.length >= 36 ? [{value: '3', label: '3 h'}] : []),
  ...(daySlots.value.length ? [{value: '24', label: '24 h'}] : []),
]);

const activeWindow = computed(() => {
  const options = windowOptions.value;
  if (options.some((o) => o.value === rainWindow.value)) return rainWindow.value;
  return options[0]?.value || '2';
});

const isDay = computed(() => activeWindow.value === '24');
const sourceSlots = computed(() => (isDay.value ? daySlots.value : radarSlots.value));
const shownSlots = computed(() =>
  isDay.value ? daySlots.value : radarSlots.value.slice(0, Number(activeWindow.value) * 12)
);
const windowLabel = computed(() => `next ${activeWindow.value} hours`);
// The day view comes in 3-hour blocks, so one dry block already counts as a break.
const rainSummary = computed(() =>
  describeRain(shownSlots.value, windowLabel.value, {minDry: isDay.value ? 1 : 2}) || rain.value?.summary
);

/* Rain on a log-ish scale so a drizzle still shows and a downpour doesn't
   swamp everything else: 0.1 mm/h is a short bar, 4 mm/h fills the track. */
const rainBars = computed(() => {
  const shown = shownSlots.value.length;
  const slots = sourceSlots.value;
  return slots.map((slot, index) => {
    const wet = slot.mm >= 0.1;
    const level = wet ? Math.min(1, Math.log10(1 + slot.mm) / Math.log10(5)) : 0;
    const chance = slot.rainChance != null ? `, ${slot.rainChance}% chance` : '';
    const span = isDay.value && slots[index + 1] ? `${slot.time}–${slots[index + 1].time}` : slot.time;
    return {
      // Keyed by position, so a refresh animates heights instead of
      // replacing bars, and a different window reshapes the row in place.
      key: index,
      wet,
      inWindow: index < shown,
      height: grown.value && wet ? Math.round(6 + level * 50) : 2,
      label: wet ? `${span}, ${slot.mm.toFixed(1)} mm/h${chance}` : `${span}, dry${chance}`,
      span,
      mm: slot.mm,
      rainChance: slot.rainChance ?? null,
    };
  });
});

/* Hovering (or dragging a finger, or arrow keys) over the bars reads one
   slot out in the same tooltip the system charts use. */
const rainHover = ref(null);
const rainTrack = ref(null);

function intensity(mm) {
  if (mm < 0.1) return 'Dry';
  if (mm < 1) return 'Light rain';
  if (mm < 4) return 'Rain';
  if (mm < 10) return 'Heavy rain';
  return 'Downpour';
}

const rainReadout = computed(() => {
  const i = rainHover.value;
  const shown = shownSlots.value.length;
  if (i == null || i >= shown) return null;
  const bar = rainBars.value[i];
  if (!bar) return null;
  const left = ((i + 0.5) / shown) * 100;
  return {
    index: i,
    left,
    flip: left > 70,
    time: i === 0 && !isDay.value ? `Now, ${bar.span}` : bar.span,
    title: intensity(bar.mm),
    amount: bar.wet ? `${bar.mm.toFixed(1)} mm/h` : null,
    chance: bar.rainChance != null ? `${bar.rainChance}% chance` : null,
  };
});

function onRainPointer(event) {
  const el = rainTrack.value;
  const shown = shownSlots.value.length;
  if (!el || !shown) return;
  const r = el.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - r.left, 0), r.width - 1);
  rainHover.value = Math.floor((x / r.width) * shown);
}

function onRainKey(event) {
  const shown = shownSlots.value.length;
  if (!shown) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    rainHover.value = Math.min(shown - 1, Math.max(0, (rainHover.value ?? (step > 0 ? -1 : shown)) + step));
  } else if (event.key === 'Escape') {
    rainHover.value = null;
  }
}

watch(shownSlots, () => (rainHover.value = null));

/* Bars rise from the baseline the first time they appear. */
const grown = ref(false);
onMounted(() => requestAnimationFrame(() => requestAnimationFrame(() => (grown.value = true))));

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
  <section class="settle relative px-6 pb-10 pt-10 md:px-10 md:pb-12 md:pt-14">
    <WeatherBackdrop
        v-if="here"
        :condition-id="here.conditionId"
        :rain-now="rainNow"
        :wind-speed="here.windSpeed"
    />

    <div class="hero-grid relative">

      <!-- Time, the thing you are most often here to read. -->
      <div class="hero-clock min-w-0">
        <h1 class="t-hero t-read flex items-baseline">
          <RollingNumber :value="hours" digit-width="0.57em" fallback="--"/>
          <span class="mx-[-0.015em] text-faint">:</span>
          <RollingNumber :value="minutes" digit-width="0.57em" fallback="--"/>
        </h1>
        <p class="mt-3 text-[1.0625rem] tracking-[-0.015em] text-dim">{{ date }}</p>
      </div>

      <div v-if="isLoading" class="hero-weather flex w-full max-w-[40rem] flex-col gap-7" aria-busy="true" aria-label="Loading the weather">
        <div class="flex items-end gap-4" aria-hidden="true">
          <span class="skeleton h-[3.25rem] w-28"></span>
          <span class="flex flex-col gap-2 pb-1">
            <span class="skeleton h-4 w-32"></span>
            <span class="skeleton h-3 w-56"></span>
          </span>
        </div>
        <div aria-hidden="true">
          <div class="flex items-center justify-between gap-4">
            <span class="skeleton h-4 w-64 max-w-[70%]"></span>
            <span class="skeleton h-[1.875rem] w-[6.5rem] rounded-[8px]"></span>
          </div>
          <div class="mt-3 flex h-14 items-end gap-[3px] border-b border-line">
            <span v-for="i in 24" :key="i" class="skeleton h-[2px] flex-1 rounded-none"></span>
          </div>
          <div class="mt-2 flex h-4 justify-between pr-[20%]">
            <span v-for="i in 4" :key="i" class="skeleton h-3 w-9"></span>
          </div>
        </div>
        <div class="grid grid-cols-5 gap-2" aria-hidden="true">
          <span v-for="i in 5" :key="i" class="skeleton h-[5.75rem] rounded-md"></span>
        </div>
      </div>

      <div v-else-if="here" class="hero-weather reveal flex w-full max-w-[40rem] flex-col gap-7">

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

        <!-- Rain, next hours -->
        <div v-if="hasRain" class="reveal">
          <div class="flex items-center justify-between gap-4">
            <Transition name="swap" mode="out-in">
              <p :key="rainSummary" class="text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{{ rainSummary }}</p>
            </Transition>
            <SegmentedControl
                :model-value="activeWindow"
                @update:model-value="rainWindow = $event"
                :options="windowOptions"
                size="sm"
                label="How far ahead to show rain"
            />
          </div>
          <div
              class="rain-chart relative mt-3"
              tabindex="0"
              role="img"
              :aria-label="rainReadout ? `${rainReadout.time}: ${rainReadout.title}${rainReadout.amount ? `, ${rainReadout.amount}` : ''}` : rainSummary"
              @pointermove="onRainPointer"
              @pointerdown="onRainPointer"
              @pointerleave="rainHover = null"
              @keydown="onRainKey"
              @blur="rainHover = null"
          >
            <div ref="rainTrack" class="flex h-14 items-end overflow-hidden border-b border-line" :class="{'is-reading': rainReadout}">
              <span
                  v-for="bar in rainBars"
                  :key="bar.key"
                  class="rain-bar rounded-t-[3px]"
                  :class="[bar.wet ? 'bg-accent' : 'bg-line', bar.inWindow ? 'in-window' : 'out-window', {'is-hovered': rainReadout?.index === bar.key}]"
                  :style="{height: `${bar.height}px`}"
              ></span>
            </div>
            <div
                v-if="rainReadout"
                class="rain-tip pointer-events-none absolute bottom-[calc(100%+6px)] z-10 flex flex-col gap-1 rounded-md px-2.5 py-2"
                :style="rainReadout.flip
                  ? {right: `calc(${100 - rainReadout.left}% - 14px)`}
                  : {left: `calc(${rainReadout.left}% - 14px)`}"
            >
              <span class="t-note t-read text-[0.75rem]">{{ rainReadout.time }}</span>
              <span class="whitespace-nowrap text-[0.8125rem] font-semibold" :class="rainReadout.amount ? 'text-accent' : 'text-ink'">
                {{ rainReadout.title }}<template v-if="rainReadout.amount"> · {{ rainReadout.amount }}</template>
              </span>
              <span v-if="rainReadout.chance" class="whitespace-nowrap text-[0.75rem] text-dim">{{ rainReadout.chance }}</span>
            </div>
          </div>
          <div class="relative mt-2 h-4 t-note text-[0.75rem]">
            <span
                v-for="tick in rainTicks"
                :key="tick.key"
                class="absolute top-0"
                :style="{left: tick.left}"
            >
              <Transition name="swap" mode="out-in">
                <span :key="tick.text" class="t-read inline-block">{{ tick.text }}</span>
              </Transition>
            </span>
          </div>
        </div>

        <div v-else-if="outlookLoading" aria-hidden="true">
          <div class="flex items-center justify-between gap-4">
            <span class="skeleton h-4 w-64 max-w-[70%]"></span>
            <span class="skeleton h-[1.875rem] w-[6.5rem] rounded-[8px]"></span>
          </div>
          <div class="mt-3 flex h-14 items-end gap-[3px] border-b border-line">
            <span v-for="i in 24" :key="i" class="skeleton h-[2px] flex-1 rounded-none"></span>
          </div>
          <div class="mt-2 flex h-4 justify-between pr-[20%]">
            <span v-for="i in 4" :key="i" class="skeleton h-3 w-9"></span>
          </div>
        </div>

        <!-- Next 12 hours -->
        <ol v-if="forecast.length" class="reveal grid grid-cols-5 gap-2">
          <li v-for="(slot, i) in forecast" :key="slot.time" class="min-w-0">
            <button
                type="button"
                class="forecast-tile press flex w-full min-w-0 flex-col gap-2 rounded-md bg-raised/70 px-2.5 py-3 text-left backdrop-blur-sm sm:px-3"
                :aria-label="`${slot.time}: ${slot.temperature} degrees, ${slot.condition || ''}. Show details`"
                @click="detail.open('forecast', {block: slot, next: forecast[i + 1]?.time, glyph: slot.glyph}, $event)"
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
            </button>
          </li>
        </ol>

        <WearAdvice v-if="plan" class="reveal" :plan="plan"/>
        <div v-else-if="outlookLoading" class="grid grid-cols-5 gap-2" aria-hidden="true">
          <span v-for="i in 5" :key="i" class="skeleton h-[5.75rem] rounded-md"></span>
        </div>
      </div>

      <p v-else class="hero-weather t-note">Weather unavailable</p>

      <!-- Live activity (what's playing) sits under the clock on wide
           screens and after the weather on narrow ones. -->
      <div v-if="$slots.live" class="hero-live min-w-0">
        <slot name="live"/>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: 'clock' 'weather' 'live';
  row-gap: 2.5rem;
}

@media (min-width: 1024px) {
  .hero-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 40rem);
    grid-template-areas: 'clock weather' 'live weather';
    grid-template-rows: auto 1fr;
    column-gap: 3.5rem;
    row-gap: 2rem;
    align-items: start;
  }

  /* The agenda sits up under the clock, now playing at the bottom. */
  .hero-live {
    align-self: stretch;
  }
}

.hero-clock {
  grid-area: clock;
}

.hero-weather {
  grid-area: weather;
}

.hero-live {
  grid-area: live;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.forecast-tile {
  transition: background-color 120ms var(--ease);
}

.forecast-tile:hover {
  background: rgb(var(--raised-rgb) / 0.95);
}

.forecast-tile:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Bars outside the chosen window shrink to nothing, so switching between
   1, 2 and 3 hours stretches or squeezes the row instead of redrawing it. */
.rain-chart {
  touch-action: pan-y;
  cursor: default;
  border-radius: 4px;
}

.rain-chart:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

/* While reading one slot, the others step back. */
.is-reading .rain-bar.in-window:not(.is-hovered) {
  opacity: 0.45;
}

.rain-tip {
  background: rgb(58 58 60);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
  animation: rain-tip-in 120ms ease-out both;
}

@keyframes rain-tip-in {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
}

.rain-bar {
  flex: 1 1 0;
  min-width: 0;
  margin-right: 3px;
  transition: height 600ms var(--ease), flex-grow 420ms var(--ease), margin 420ms var(--ease), opacity 300ms var(--ease);
}

.rain-bar:last-child,
.rain-bar.in-window:has(+ .out-window) {
  margin-right: 0;
}

.rain-bar.out-window {
  flex-grow: 0;
  margin-right: 0;
  opacity: 0;
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
