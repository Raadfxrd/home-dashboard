<script setup>
import {computed} from 'vue';

/**
 * A hand-drawn sparkline. Small enough that a charting library would cost
 * more than it gives, and this way the curve, the cap and the trailing dot
 * are all under our control.
 */
const props = defineProps({
  values: {type: Array, default: () => []},
  max: {type: Number, default: null},
  height: {type: Number, default: 26},
  tone: {type: String, default: 'var(--text-dim)'},
});

const W = 100;

const points = computed(() => {
  const vals = (props.values || []).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return null;

  const hi = props.max ?? Math.max(...vals, 1);
  const lo = Math.min(...vals, 0);
  const span = hi - lo || 1;
  const H = props.height;

  return vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - lo) / span) * (H - 3) - 1.5;
    return [x, y];
  });
});

/* Catmull-Rom through the points, so the line reads as a trace rather than
   a polyline, without the overshoot a naive tension curve gives. */
const path = computed(() => {
  const p = points.value;
  if (!p) return '';
  let d = `M ${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)}`;
  for (let i = 0; i < p.length - 1; i += 1) {
    const p0 = p[i === 0 ? 0 : i - 1];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2 >= p.length ? p.length - 1 : i + 2];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
});

const areaPath = computed(() => (path.value ? `${path.value} L ${W} ${props.height} L 0 ${props.height} Z` : ''));
const last = computed(() => (points.value ? points.value[points.value.length - 1] : null));
const uid = `sl${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <svg
      :viewBox="`0 0 ${W} ${height}`"
      :height="height"
      class="w-full block overflow-visible"
      preserveAspectRatio="none"
      aria-hidden="true"
  >
    <defs>
      <linearGradient :id="uid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="tone" stop-opacity="0.22"/>
        <stop offset="100%" :stop-color="tone" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <template v-if="path">
      <path :d="areaPath" :fill="`url(#${uid})`"/>
      <path :d="path" fill="none" :stroke="tone" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round"
            vector-effect="non-scaling-stroke"/>
      <circle v-if="last" :cx="last[0]" :cy="last[1]" r="1.8" :fill="tone"
              vector-effect="non-scaling-stroke"/>
    </template>
  </svg>
</template>
