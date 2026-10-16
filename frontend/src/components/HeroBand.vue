<script setup>
import {computed, onMounted, ref, watch} from 'vue';
import AppIcon from './AppIcon.vue';
import RollingNumber from './RollingNumber.vue';
import WeatherBackdrop from './WeatherBackdrop.vue';
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

/* ?weather=rain|heavy|drizzle|storm|snow|sleet|fog|clouds|clear plays that
   animation over the real dashboard, to try them out. Only the backdrop
   changes; the numbers stay real. ?wind=40 sets the wind (slant), ?mm=3
   the rain strength. */
const SIMULATE = {
  clear: {conditionId: 800, mm: 0, wind: 8},
  clouds: {conditionId: 804, mm: 0, wind: 15},
  fog: {conditionId: 741, mm: 0, wind: 5},
  drizzle: {conditionId: 301, mm: 0.3, wind: 12},
  rain: {conditionId: 500, mm: 1.2, wind: 20},
  heavy: {conditionId: 502, mm: 6, wind: 35},
  storm: {conditionId: 211, mm: 8, wind: 55},
  snow: {conditionId: 601, mm: 1, wind: 10},
  sleet: {conditionId: 611, mm: 1.5, wind: 25},
};
const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const simulated = SIMULATE[query.get('weather')] ? {name: query.get('weather'), ...SIMULATE[query.get('weather')]} : null;
const numberParam = (key) => (query.has(key) && Number.isFinite(Number(query.get(key))) ? Number(query.get(key)) : null);
const backdrop = computed(() => ({
  conditionId: simulated?.conditionId ?? props.here?.conditionId,
  rainNow: numberParam('mm') ?? simulated?.mm ?? (rain.value?.slots?.[0]?.mm || 0),
  windSpeed: numberParam('wind') ?? simulated?.wind ?? props.here?.windSpeed,
}));

/* One scrollable rain timeline, hour by hour for the next 5 days. The
   first hours come from the radar (its 5-minute readings averaged per
   hour), the rest from the forecast. */
const HOUR = 3600000;
// Bars rise from the baseline the first time they appear. Declared before
// anything reads it: on a return visit the weather is already loaded.
const grown = ref(false);
const radarSlots = computed(() => (rain.value?.available ? rain.value.slots || [] : []));
const weekBlocks = computed(() => props.outlook?.week || props.outlook?.blocks || []);
const hasRain = computed(() => radarSlots.value.length > 0 || weekBlocks.value.length > 0);

const dayName = new Intl.DateTimeFormat('en-GB', {weekday: 'short'});
const hh = (t) => `${String(new Date(t).getHours()).padStart(2, '0')}:00`;

const timeline = computed(() => {
  const now = Date.now();
  const radar = radarSlots.value.map((slot, i) => ({at: now + i * 5 * 60000, mm: slot.mm || 0}));
  const blocks = weekBlocks.value;
  const lastRadar = radar.length ? radar[radar.length - 1].at + 5 * 60000 : now;
  const last = blocks.length ? blocks[blocks.length - 1].at + 1.5 * HOUR : lastRadar;
  const out = [];
  for (let t = Math.floor(now / HOUR) * HOUR; t < last; t += HOUR) {
    const inHour = radar.filter((r) => r.at >= t && r.at < t + HOUR);
    const block = blocks.find((x) => t >= x.at - 1.5 * HOUR && t < x.at + 1.5 * HOUR);
    if (inHour.length >= 3) {
      const mm = inHour.reduce((sum, r) => sum + r.mm, 0) / inHour.length;
      out.push({at: t, time: hh(t), mm: Math.round(mm * 100) / 100, rainChance: block?.rainChance ?? null, measured: true});
    } else if (block) {
      out.push({at: t, time: hh(t), mm: block.mm || 0, rainChance: block.rainChance ?? null, measured: false});
    }
  }
  return out;
});

/* Rain on a log-ish scale so a drizzle still shows and a downpour doesn't
   swamp everything else: 0.1 mm/h is a short bar, 4 mm/h fills the track. */
const COL = 12; // px per hour, matches .rain-col
const rainBars = computed(() => {
  let x = 0;
  let lastTick = -Infinity;
  return timeline.value.map((slot, i) => {
    const wet = slot.mm >= 0.1;
    const level = wet ? Math.min(1, Math.log10(1 + slot.mm) / Math.log10(5)) : 0;
    const d = new Date(slot.at);
    const midnight = i > 0 && d.getHours() === 0;
    let tick = null;
    if (i === 0) tick = 'Now';
    else if (midnight) tick = dayName.format(d);
    else if (d.getHours() % 6 === 0) tick = slot.time;
    if (midnight) x += 6;
    // Labels keep a little room apart; a new day always gets its name.
    if (tick && i > 0 && !midnight && x - lastTick < 60) tick = null;
    if (tick) lastTick = x;
    x += COL;
    return {
      key: i,
      ...slot,
      wet,
      height: grown.value && wet ? Math.round(6 + level * 50) : 2,
      tick,
      day: midnight,
    };
  });
});

const rainSummary = computed(() => {
  if (radarSlots.value.length) {
    return describeRain(radarSlots.value, `next ${Math.round(radarSlots.value.length / 12)} hours`) || rain.value?.summary;
  }
  const day = timeline.value.slice(0, 24);
  return day.length ? describeRain(day, 'next 24 hours', {minDry: 2}) : null;
});

/* Hovering (or dragging a finger, or arrow keys) over a bar reads that
   slot out in the same tooltip the system charts use. */
const rainHover = ref(null);
const rainScroller = ref(null);
const rainWrap = ref(null);
const tipLeft = ref(0);

function intensity(mm) {
  if (mm < 0.1) return 'Dry';
  if (mm < 1) return 'Light rain';
  if (mm < 4) return 'Rain';
  if (mm < 10) return 'Heavy rain';
  return 'Downpour';
}

const dayLong = new Intl.DateTimeFormat('en-GB', {weekday: 'long'});
function whenText(bar) {
  if (bar.key === 0) return `Now, until ${hh(bar.at + HOUR)}`;
  const d = new Date(bar.at);
  const today = new Date();
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86400000);
  const label = days === 0 ? '' : days === 1 ? 'Tomorrow ' : `${dayLong.format(d)} `;
  return `${label}${bar.time}–${hh(bar.at + HOUR)}`;
}

const rainReadout = computed(() => {
  const bar = rainBars.value[rainHover.value];
  if (!bar) return null;
  const width = rainWrap.value?.clientWidth || 1;
  return {
    index: bar.key,
    left: tipLeft.value,
    flip: tipLeft.value > width * 0.7,
    time: whenText(bar),
    title: intensity(bar.mm),
    amount: bar.wet ? `${bar.mm.toFixed(1)} mm/h` : null,
    chance: bar.rainChance != null ? `${bar.rainChance}% chance` : null,
  };
});

function showBar(index) {
  const wrap = rainWrap.value;
  const el = rainScroller.value?.querySelector(`[data-i="${index}"]`);
  if (!wrap || !el) return;
  const w = wrap.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  tipLeft.value = r.left + r.width / 2 - w.left;
  rainHover.value = index;
}

/* Mouse drag scrolls the timeline; touch scrolls natively. */
let drag = null;
function onRainDown(event) {
  if (event.pointerType !== 'mouse' || !rainScroller.value) return;
  drag = {x: event.clientX, left: rainScroller.value.scrollLeft, moved: false};
}
function onRainMove(event) {
  if (drag) {
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > 3) drag.moved = true;
    if (drag.moved) {
      rainScroller.value.scrollLeft = drag.left - dx;
      rainHover.value = null;
      return;
    }
  }
  const bar = event.target.closest?.('[data-i]');
  if (bar) showBar(Number(bar.dataset.i));
}
function onRainUp() {
  drag = null;
}

function onRainKey(event) {
  const count = rainBars.value.length;
  if (!count) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = Math.min(count - 1, Math.max(0, (rainHover.value ?? (step > 0 ? -1 : count)) + step));
    rainScroller.value?.querySelector(`[data-i="${next}"]`)?.scrollIntoView({block: 'nearest', inline: 'nearest'});
    requestAnimationFrame(() => showBar(next));
  } else if (event.key === 'Escape') {
    rainHover.value = null;
  }
}

/* Buttons page through the timeline; they hide at either end. */
const canBack = ref(false);
const canForward = ref(false);
function onRainScroll() {
  const el = rainScroller.value;
  if (!el) return;
  canBack.value = el.scrollLeft > 4;
  canForward.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
  rainHover.value = null;
}
function page(direction) {
  const el = rainScroller.value;
  if (el) el.scrollBy({left: direction * el.clientWidth * 0.8, behavior: 'smooth'});
}
watch(rainBars, () => requestAnimationFrame(onRainScroll), {flush: 'post'});

onMounted(() => requestAnimationFrame(() => requestAnimationFrame(() => {
  grown.value = true;
  onRainScroll();
})));

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
        :condition-id="backdrop.conditionId"
        :rain-now="backdrop.rainNow"
        :wind-speed="backdrop.windSpeed"
    />
    <a
        v-if="simulated"
        href="/"
        class="glass press absolute right-4 top-4 z-10 rounded-full px-3 py-1 text-[0.75rem] text-dim hover:text-ink"
        title="Back to the real weather"
    >Simulating {{ simulated.name }} ×</a>

    <div class="hero-grid over-weather relative">

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

        <!-- Rain: radar, then the forecast, as one scrollable timeline -->
        <div v-if="hasRain" class="reveal">
          <div class="flex items-center justify-between gap-4">
            <Transition name="swap" mode="out-in">
              <p :key="rainSummary" class="text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{{ rainSummary }}</p>
            </Transition>
            <div class="flex shrink-0 gap-1.5">
              <button type="button" class="rain-page glass press flex h-7 w-7 items-center justify-center rounded-full" :class="{'is-off': !canBack}" :disabled="!canBack" aria-label="Earlier" @click="page(-1)">
                <AppIcon :size="13" name="arrow" class="rotate-180"/>
              </button>
              <button type="button" class="rain-page glass press flex h-7 w-7 items-center justify-center rounded-full" :class="{'is-off': !canForward}" :disabled="!canForward" aria-label="Later" @click="page(1)">
                <AppIcon :size="13" name="arrow"/>
              </button>
            </div>
          </div>
          <div ref="rainWrap" class="relative mt-3">
            <div
                ref="rainScroller"
                class="rain-scroll overflow-x-auto"
                :class="{'fade-start': canBack, 'fade-end': canForward}"
                tabindex="0"
                role="img"
                :aria-label="rainReadout ? `${rainReadout.time}: ${rainReadout.title}${rainReadout.amount ? `, ${rainReadout.amount}` : ''}` : rainSummary"
                @scroll.passive="onRainScroll"
                @pointerdown="onRainDown"
                @pointermove="onRainMove"
                @pointerup="onRainUp"
                @pointerleave="onRainUp(); rainHover = null"
                @keydown="onRainKey"
                @blur="rainHover = null"
            >
              <div class="rain-track flex w-max items-end pb-5" :class="{'is-reading': rainReadout}">
                <span
                    v-for="bar in rainBars"
                    :key="bar.key"
                    :data-i="bar.key"
                    class="rain-col relative flex h-14 items-end"
                    :class="{'is-day': bar.day}"
                >
                  <span
                      class="rain-bar block w-full rounded-t-[3px]"
                      :class="[bar.wet ? 'bg-accent' : 'bg-line', {'is-hovered': rainReadout?.index === bar.key}]"
                      :style="{height: `${bar.height}px`}"
                  ></span>
                  <span v-if="bar.tick" class="rain-tick t-read t-note absolute left-0 top-full mt-2 whitespace-nowrap text-[0.75rem]" :class="{'text-dim': bar.day}">{{ bar.tick }}</span>
                </span>
              </div>
            </div>
            <div
                v-if="rainReadout"
                class="rain-tip pointer-events-none absolute bottom-[calc(100%-0.5rem)] z-10 flex flex-col gap-1 rounded-md px-2.5 py-2"
                :style="rainReadout.flip
                  ? {right: `calc(100% - ${rainReadout.left}px - 14px)`}
                  : {left: `${rainReadout.left - 14}px`}"
            >
              <span class="t-note t-read text-[0.75rem]">{{ rainReadout.time }}</span>
              <span class="whitespace-nowrap text-[0.8125rem] font-semibold" :class="rainReadout.amount ? 'text-accent' : 'text-ink'">
                {{ rainReadout.title }}<template v-if="rainReadout.amount"> · {{ rainReadout.amount }}</template>
              </span>
              <span v-if="rainReadout.chance" class="whitespace-nowrap text-[0.75rem] text-dim">{{ rainReadout.chance }}</span>
            </div>
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
                data-rain-catch
                class="forecast-tile press flex w-full min-w-0 flex-col gap-2 glass rounded-md px-2.5 py-3 text-left sm:px-3"
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
  background: var(--glass-fill-hover);
}

.forecast-tile:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Bars outside the chosen window shrink to nothing, so switching between
   1, 2 and 3 hours stretches or squeezes the row instead of redrawing it. */
.rain-scroll {
  scrollbar-width: none;
  touch-action: pan-x;
  cursor: grab;
  border-bottom: 0;
  outline: none;
}

.rain-scroll::-webkit-scrollbar {
  display: none;
}

.rain-scroll:active {
  cursor: grabbing;
}

.rain-scroll:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 4px;
}

/* Soft edges where there's more to scroll to. */
.rain-scroll.fade-end {
  -webkit-mask-image: linear-gradient(to right, #000 88%, transparent);
  mask-image: linear-gradient(to right, #000 88%, transparent);
}

.rain-scroll.fade-start {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 12%);
  mask-image: linear-gradient(to right, transparent, #000 12%);
}

.rain-scroll.fade-start.fade-end {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
  mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
}

/* The baseline, drawn per column so it scrolls with the bars. */
.rain-col {
  width: 12px;
  padding-right: 3px;
  border-bottom: 1px solid rgb(var(--line-rgb));
}

/* A thin line where each new day starts. */
.rain-col.is-day {
  margin-left: 6px;
}

.rain-col.is-day::before {
  content: '';
  position: absolute;
  left: -4px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgb(var(--line-soft-rgb));
}

.rain-page {
  color: rgb(var(--text-dim-rgb));
  transition: opacity 200ms var(--ease), color 120ms var(--ease), background-color 120ms var(--ease);
}

.rain-page:hover {
  color: rgb(var(--text-rgb));
  background: var(--glass-fill-hover);
}

.rain-page.is-off {
  opacity: 0.3;
  pointer-events: none;
}

/* While reading one slot, the others step back. */
.is-reading .rain-bar:not(.is-hovered) {
  opacity: 0.45;
}

.rain-tip {
  background: rgb(44 44 48 / 0.92);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08), 0 10px 28px rgba(0, 0, 0, 0.5);
  -webkit-backdrop-filter: blur(30px);
  backdrop-filter: blur(30px);
  animation: rain-tip-in 120ms ease-out both;
}

@keyframes rain-tip-in {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
}

.rain-bar {
  transition: height 600ms var(--ease), opacity 160ms var(--ease);
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
