<script setup>
import {computed, onUnmounted, ref, watch} from 'vue';

/**
 * A small time-series chart drawn as SVG, on a fixed scale it is given (so
 * 30% always sits at the same height). Two layouts:
 *   - "area": series rise from the bottom (processor use).
 *   - "mirror": the first series rises from a centre line and the second
 *     hangs below it, on one shared scale (download above, upload below).
 *
 * Hover, touch-drag or arrow keys move a crosshair; a tooltip reads out the
 * time and every series at that moment. Gaps in the data stay gaps.
 */
const props = defineProps({
  points: {type: Array, default: () => []}, // [{t, [key]: number|null}]
  from: {type: Number, required: true},
  to: {type: Number, required: true},
  series: {type: Array, required: true}, // [{key, label, color}]
  max: {type: Number, required: true},
  layout: {type: String, default: 'area'},
  height: {type: Number, default: 120},
  stepSeconds: {type: Number, default: 10},
  format: {type: Function, default: (v) => `${Math.round(v)}`},
  timeFormat: {type: Function, default: (t) => new Date(t).toLocaleTimeString('nl-NL', {hour: '2-digit', minute: '2-digit'})},
  label: {type: String, default: 'Chart'},
});

const W = 1000;
const mid = computed(() => props.height / 2);

/* When the scale changes (a busier hour raises the network ceiling) the
   ceiling glides to its new value, so the shapes stretch instead of jump. */
const shownMax = ref(props.max);
let tween = 0;
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

watch(() => props.max, (to) => {
  cancelAnimationFrame(tween);
  const from = shownMax.value;
  if (reduceMotion || !Number.isFinite(from) || from === to) {
    shownMax.value = to;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / 450);
    const eased = 1 - (1 - p) ** 3;
    shownMax.value = from + (to - from) * eased;
    if (p < 1) tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
});

onUnmounted(() => cancelAnimationFrame(tween));

function x(t) {
  const span = props.to - props.from || 1;
  return ((t - props.from) / span) * W;
}

function y(value, index) {
  const v = Math.max(0, Math.min(shownMax.value, value)) / shownMax.value;
  if (props.layout === 'mirror') {
    const reach = mid.value - 2;
    return index === 0 ? mid.value - v * reach : mid.value + v * reach;
  }
  return props.height - 1 - v * (props.height - 4);
}

function base(index) {
  if (props.layout === 'mirror') return mid.value + (index === 0 ? -0.5 : 0.5);
  return props.height - 1;
}

/* Split a series wherever a value is missing or samples are too far apart,
   so a restart or an outage shows as a gap instead of a straight line. */
function runs(key) {
  const gapMs = Math.max(props.stepSeconds * 3, 30) * 1000;
  const out = [];
  let current = [];
  let prevT = null;
  for (const p of props.points) {
    const v = p[key];
    if (v == null || !Number.isFinite(v) || (prevT !== null && p.t - prevT > gapMs)) {
      if (current.length) out.push(current);
      current = [];
    }
    if (v != null && Number.isFinite(v)) current.push(p);
    prevT = p.t;
  }
  if (current.length) out.push(current);
  return out;
}

const shapes = computed(() =>
  props.series.map((s, index) => {
    const parts = runs(s.key);
    let line = '';
    let area = '';
    for (const run of parts) {
      const pts = run.map((p) => `${x(p.t).toFixed(1)} ${y(p[s.key], index).toFixed(1)}`);
      if (run.length === 1) {
        pts.push(`${(x(run[0].t) + 2).toFixed(1)} ${y(run[0][s.key], index).toFixed(1)}`);
      }
      line += `M${pts.join(' L')} `;
      const b = base(index).toFixed(1);
      area += `M${x(run[0].t).toFixed(1)} ${b} L${pts.join(' L')} L${x(run[run.length - 1].t).toFixed(1)} ${b} Z `;
    }
    return {key: s.key, color: s.color, line, area, fillOpacity: props.layout === 'mirror' ? 0.8 : 0.18};
  })
);

const gridLines = computed(() =>
  props.layout === 'mirror'
    ? [2, props.height - 2]
    : [3, props.height / 2, props.height - 1]
);

const empty = computed(() => props.points.filter((p) => props.series.some((s) => p[s.key] != null)).length < 2);

/* ---------- Hover / touch / keyboard ---------- */

const plot = ref(null);
const active = ref(-1);

function nearestIndex(t) {
  const pts = props.points;
  if (!pts.length) return -1;
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (pts[m].t < t) lo = m;
    else hi = m;
  }
  return Math.abs(pts[lo].t - t) <= Math.abs(pts[hi].t - t) ? lo : hi;
}

function onPointer(event) {
  const rect = plot.value?.getBoundingClientRect();
  if (!rect || !rect.width) return;
  const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const t = props.from + frac * (props.to - props.from);
  if (t < (props.points[0]?.t ?? Infinity) - props.stepSeconds * 1000) {
    active.value = -1;
    return;
  }
  active.value = nearestIndex(t);
}

function onLeave(event) {
  if (event.pointerType === 'mouse') active.value = -1;
}

function onKey(event) {
  const n = props.points.length;
  if (!n) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const start = active.value < 0 ? n - 1 : active.value;
    active.value = Math.max(0, Math.min(n - 1, start + (event.key === 'ArrowLeft' ? -1 : 1)));
  } else if (event.key === 'Escape') {
    active.value = -1;
  }
}

const readout = computed(() => {
  const p = props.points[active.value];
  if (!p) return null;
  const left = (x(p.t) / W) * 100;
  return {
    left,
    flip: left > 62,
    time: props.timeFormat(p.t),
    rows: props.series.map((s, index) => ({
      key: s.key,
      label: s.label,
      color: s.color,
      value: p[s.key] == null ? '–' : props.format(p[s.key]),
      top: p[s.key] == null ? null : y(p[s.key], index),
    })),
  };
});
</script>

<template>
  <div
      ref="plot"
      class="time-chart relative touch-pan-y select-none outline-none"
      :style="{height: `${height}px`}"
      tabindex="0"
      role="img"
      :aria-label="label"
      @pointermove="onPointer"
      @pointerdown="onPointer"
      @pointerleave="onLeave"
      @keydown="onKey"
      @blur="active = -1"
  >
    <svg
        class="absolute inset-0 h-full w-full overflow-visible"
        :class="{'chart-reveal': !empty}"
        :viewBox="`0 0 ${W} ${height}`"
        preserveAspectRatio="none"
        aria-hidden="true"
    >
      <line
          v-for="(gy, i) in gridLines"
          :key="i"
          x1="0" :x2="W" :y1="gy" :y2="gy"
          stroke="rgb(var(--line-soft-rgb))"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
      />
      <template v-for="shape in shapes" :key="shape.key">
        <path :d="shape.area" :fill="shape.color" :fill-opacity="shape.fillOpacity"/>
        <path
            v-if="layout !== 'mirror'"
            :d="shape.line"
            fill="none"
            :stroke="shape.color"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
        />
      </template>
      <line
          v-if="layout === 'mirror'"
          x1="0" :x2="W" :y1="mid" :y2="mid"
          stroke="rgb(var(--line-rgb))"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
      />
    </svg>

    <p v-if="empty" class="chart-empty absolute inset-0 flex items-center justify-center t-note">
      Collecting history. This fills in over the next few minutes.
    </p>

    <template v-if="readout">
      <span class="pointer-events-none absolute bottom-0 top-0 w-px bg-dim/70" :style="{left: `${readout.left}%`}"></span>
      <template v-for="row in readout.rows" :key="row.key">
        <span
            v-if="row.top !== null"
            class="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-raised"
            :style="{left: `${readout.left}%`, top: `${row.top}px`, background: row.color}"
        ></span>
      </template>
      <div
          class="chart-tip tip-in pointer-events-none absolute top-1 z-10 flex flex-col gap-1 rounded-md px-2.5 py-2"
          :style="readout.flip
            ? {right: `calc(${100 - readout.left}% + 12px)`}
            : {left: `calc(${readout.left}% + 12px)`}"
      >
        <span class="t-note text-[0.75rem]">{{ readout.time }}</span>
        <span v-for="row in readout.rows" :key="row.key" class="flex items-center gap-2 whitespace-nowrap text-[0.8125rem] text-ink">
          <span v-if="readout.rows.length > 1" class="h-2 w-2 rounded-[2px]" :style="{background: row.color}"></span>
          <span v-if="readout.rows.length > 1" class="text-dim">{{ row.label }}</span>
          <span class="font-semibold">{{ row.value }}</span>
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.time-chart:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 4px;
}

/* The trace draws in from the left the first time data is there, which is
   also every time the range changes (the chart is swapped for a new one). */
.chart-reveal {
  animation: chart-draw 560ms var(--ease) both;
}

@keyframes chart-draw {
  from {
    clip-path: inset(0 100% 0 0);
  }
  to {
    clip-path: inset(0 0 0 0);
  }
}

.chart-empty {
  animation: fade-in 300ms var(--ease) both;
}

.tip-in {
  animation: fade-in 120ms ease-out both;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chart-reveal,
  .chart-empty,
  .tip-in {
    animation: none;
  }
}

.chart-tip {
  background: rgb(58 58 60);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
}
</style>
