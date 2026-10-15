<script setup>
import {computed} from 'vue';
import TimeChart from './TimeChart.vue';
import SegmentedControl from './SegmentedControl.vue';
import RollingNumber from './RollingNumber.vue';

/**
 * The NAS at a glance. A plain-language status line first, then the two
 * things that actually move (processor and network) as charts over the
 * chosen window, then memory and storage as meters, since they barely
 * change minute to minute. History comes from the backend, so the charts
 * are full as soon as the page opens.
 */
const props = defineProps({
  metrics: {type: Object, required: true},
  fallback: {type: Object, default: null},
  history: {type: Object, default: null},
  range: {type: String, default: '1h'},
  loading: {type: Boolean, default: false},
});

const emit = defineEmits(['update:range']);

const CPU_COLOR = 'rgb(var(--accent-rgb))';
const UP_COLOR = '#199e70';

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '–';
  const value = Number(bytes);
  if (!Number.isFinite(value)) return '–';
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let current = value / 1024;
  let i = 0;
  while (current >= 1024 && i < units.length - 1) {
    current /= 1024;
    i += 1;
  }
  return `${current >= 10 ? current.toFixed(0) : current.toFixed(1)} ${units[i]}`;
}

const rate = (bytes) => `${formatBytes(bytes)}/s`;
const pct = (v) => `${Math.round(v)}%`;
const clock = (t) => new Date(t).toLocaleTimeString('nl-NL', {hour: '2-digit', minute: '2-digit'});

function uptimeText(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return `up ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `up ${hours} hour${hours === 1 ? '' : 's'}`;
  return `up ${Math.max(1, Math.floor(seconds / 60))} min`;
}

const cpu = computed(() => props.metrics?.cpu?.usagePercent);
const ram = computed(() => props.metrics?.memory?.usedPercent);
const disk = computed(() => props.metrics?.disk?.usedPercent ?? props.fallback?.usedPercent);
const diskFree = computed(() => props.metrics?.disk?.freeBytes ?? props.fallback?.freeBytes);
const rx = computed(() => props.metrics?.network?.totalRxRateBytesPerSecond);
const tx = computed(() => props.metrics?.network?.totalTxRateBytesPerSecond);

/* The one sentence that says whether anything needs attention. */
const status = computed(() => {
  const m = props.metrics;
  if (!m?.online) return {tone: 'fault', text: 'Can’t reach the NAS', detail: m?.error || ''};
  if (Number.isFinite(disk.value) && disk.value >= 90) return {tone: 'fault', text: 'Storage almost full'};
  if (Number.isFinite(ram.value) && ram.value >= 90) return {tone: 'warn', text: 'Memory almost full'};
  if (Number.isFinite(cpu.value) && cpu.value >= 85) return {tone: 'warn', text: 'Processor busy'};
  return {tone: 'live', text: 'Running normally'};
});

const host = computed(() => {
  const parts = [props.metrics?.hostName || props.metrics?.label, uptimeText(props.metrics?.uptimeSeconds)].filter(Boolean);
  return parts.join(', ');
});

const points = computed(() => props.history?.points || []);
const stats = computed(() => props.history?.stats || {});
const span = computed(() => {
  const to = props.history?.to || Date.now();
  const from = props.history?.from || to - (props.range === '24h' ? 86400000 : 3600000);
  return {from, to};
});

const cpuSummary = computed(() => {
  const s = stats.value;
  if (s.cpuAverage == null) return '';
  const peak = s.cpuPeak != null ? `, peak ${s.cpuPeak}% at ${clock(s.cpuPeakAt)}` : '';
  return `average ${s.cpuAverage}%${peak}`;
});

/* A round number just above the busiest moment, shared by both directions
   so download and upload are directly comparable. */
const netMax = computed(() => {
  // Rounded in the same binary units the labels are written in, so the
  // scale reads "40 MB/s" rather than "38 MB/s".
  const peakMiB = Math.max(stats.value.rxPeak || 0, stats.value.txPeak || 0, rx.value || 0, tx.value || 0, 1024 * 1024) / 1048576;
  const magnitude = 10 ** Math.floor(Math.log10(peakMiB));
  const step = [1, 2, 4, 5, 10].find((m) => m * magnitude >= peakMiB);
  return step * magnitude * 1048576;
});

const xLabels = computed(() =>
  props.range === '24h' ? ['24 h ago', '12 h ago', 'Now'] : ['60 min ago', '30 min ago', 'Now']
);

function meterTone(percent) {
  if (!Number.isFinite(percent)) return 'bg-dim';
  if (percent >= 90) return 'bg-fault';
  if (percent >= 75) return 'bg-warn';
  return 'bg-dim';
}
</script>

<template>
  <section class="settle">
    <header class="mb-4 flex items-center justify-between gap-4">
      <h2 class="t-section">System</h2>
      <span v-if="loading" class="skeleton h-[2.625rem] w-[10.5rem] rounded-[10px]" aria-hidden="true"></span>
      <SegmentedControl
          v-else-if="metrics.configured"
          :model-value="range"
          :options="[{value: '1h', label: '1 hour'}, {value: '24h', label: '24 hours'}]"
          label="Time range"
          @update:model-value="emit('update:range', $event)"
      />
    </header>

    <!-- First load: the card's own shape, so nothing moves when data lands. -->
    <div v-if="loading" class="panel" aria-busy="true" aria-label="Loading NAS status">
      <div class="flex h-[3.4rem] items-center gap-2.5 border-b border-line-soft px-5" aria-hidden="true">
        <span class="skeleton h-2 w-2 rounded-full"></span>
        <span class="skeleton h-4 w-36"></span>
        <span class="skeleton ml-auto h-3 w-28"></span>
      </div>
      <div v-for="(h, i) in [112, 88]" :key="h" class="flex flex-col gap-3 border-b border-line-soft px-5 pb-4 pt-4" aria-hidden="true">
        <div class="flex items-center gap-3" :class="i === 0 ? 'h-7' : 'h-5'">
          <span class="skeleton h-4 w-20"></span>
          <span v-if="i === 0" class="skeleton h-7 w-16"></span>
          <span class="skeleton ml-auto h-3 w-40"></span>
        </div>
        <div class="flex gap-3">
          <span class="skeleton min-w-0 flex-1 rounded-md" :style="{height: `${h}px`}"></span>
          <span class="w-14 shrink-0"></span>
        </div>
        <span v-if="i === 0" class="h-4"></span>
      </div>
      <div class="grid grid-cols-2 gap-7 px-5 pb-5 pt-4" aria-hidden="true">
        <div v-for="m in 2" :key="m" class="flex flex-col gap-2.5">
          <div class="flex h-6 items-center justify-between"><span class="skeleton h-4 w-16"></span><span class="skeleton h-4 w-10"></span></div>
          <span class="skeleton h-1.5 rounded-full"></span>
          <span class="flex h-5 items-center"><span class="skeleton h-3 w-28"></span></span>
        </div>
      </div>
    </div>

    <div v-else-if="metrics.configured" class="reveal panel">
      <!-- Status -->
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line-soft px-5 py-3.5">
        <span class="status-dot" :class="`dot dot-${status.tone}`"></span>
        <Transition name="swap" mode="out-in">
          <span :key="status.text" class="text-[0.9375rem] font-semibold text-ink">{{ status.text }}</span>
        </Transition>
        <span v-if="status.detail" class="t-note">{{ status.detail }}</span>
        <span v-if="host && metrics.online" class="ml-auto t-note">{{ host }}</span>
      </div>

      <template v-if="metrics.online">
        <!-- Processor -->
        <div class="flex flex-col gap-3 border-b border-line-soft px-5 pb-4 pt-4">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="t-body">Processor</span>
            <span class="text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-ink"><RollingNumber :value="cpu" suffix="%" fallback="–" digit-width="0.6em"/></span>
            <Transition name="swap" mode="out-in">
              <span :key="cpuSummary" class="ml-auto t-note">{{ cpuSummary }}</span>
            </Transition>
          </div>
          <div class="flex gap-3">
            <TimeChart
                :key="`cpu-${history?.range}`"
                :loading="!history"
                class="min-w-0 flex-1"
                :points="points"
                :from="span.from"
                :to="span.to"
                :series="[{key: 'cpu', label: 'Processor', color: CPU_COLOR}]"
                :max="100"
                :height="112"
                :step-seconds="history?.stepSeconds || 10"
                :format="pct"
                :label="`Processor use over the last ${range === '24h' ? '24 hours' : 'hour'}, 0 to 100 percent. ${cpuSummary}`"
            />
            <div class="relative w-14 shrink-0 text-[0.6875rem] tabular-nums text-faint" aria-hidden="true">
              <span class="absolute -top-1.5">100%</span>
              <span class="absolute top-1/2 -translate-y-1/2">50%</span>
              <span class="absolute -bottom-1.5">0%</span>
            </div>
          </div>
          <div class="mr-[4.25rem] flex justify-between text-[0.6875rem] text-faint" aria-hidden="true">
            <span v-for="text in xLabels" :key="text">{{ text }}</span>
          </div>
        </div>

        <!-- Network -->
        <div class="flex flex-col gap-3 border-b border-line-soft px-5 pb-4 pt-4">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span class="t-body">Network</span>
            <span class="flex items-center gap-1.5 text-[0.875rem] text-dim">
              <span class="h-2.5 w-2.5 rounded-[3px]" :style="{background: CPU_COLOR}"></span>
              Down <span class="font-semibold text-ink">{{ rate(rx) }}</span>
            </span>
            <span class="flex items-center gap-1.5 text-[0.875rem] text-dim">
              <span class="h-2.5 w-2.5 rounded-[3px]" :style="{background: UP_COLOR}"></span>
              Up <span class="font-semibold text-ink">{{ rate(tx) }}</span>
            </span>
            <span v-if="stats.rxPeak" class="ml-auto t-note">peak {{ rate(stats.rxPeak) }} down</span>
          </div>
          <div class="flex gap-3">
            <TimeChart
                :key="`net-${history?.range}`"
                :loading="!history"
                class="min-w-0 flex-1"
                layout="mirror"
                :points="points"
                :from="span.from"
                :to="span.to"
                :series="[{key: 'rx', label: 'Down', color: CPU_COLOR}, {key: 'tx', label: 'Up', color: UP_COLOR}]"
                :max="netMax"
                :height="88"
                :step-seconds="history?.stepSeconds || 10"
                :format="rate"
                :label="`Network traffic over the last ${range === '24h' ? '24 hours' : 'hour'}: download above the line, upload below, same scale.`"
            />
            <div class="relative w-14 shrink-0 text-[0.6875rem] tabular-nums text-faint" aria-hidden="true">
              <span class="absolute -top-1.5 whitespace-nowrap">{{ rate(netMax) }}</span>
              <span class="absolute top-1/2 -translate-y-1/2">0</span>
              <span class="absolute -bottom-1.5 whitespace-nowrap">{{ rate(netMax) }}</span>
            </div>
          </div>
        </div>

        <!-- Memory and storage -->
        <div class="grid grid-cols-2 gap-7 px-5 pb-5 pt-4">
          <div class="flex flex-col gap-2.5">
            <div class="flex items-baseline justify-between gap-2">
              <span class="t-body">Memory</span>
              <span class="text-[1.0625rem] font-semibold text-ink"><RollingNumber :value="ram" suffix="%" fallback="–"/></span>
            </div>
            <span class="well block h-1.5 overflow-hidden rounded-full">
              <span class="block h-full rounded-full transition-[width] duration-700 ease-ease" :class="meterTone(ram)" :style="{width: `${Math.max(0, Math.min(100, ram || 0))}%`}"></span>
            </span>
            <span class="t-note">{{ formatBytes(metrics.memory?.usedBytes) }} of {{ formatBytes(metrics.memory?.totalBytes) }} in use</span>
          </div>
          <div class="flex flex-col gap-2.5">
            <div class="flex items-baseline justify-between gap-2">
              <span class="t-body">Storage</span>
              <span class="text-[1.0625rem] font-semibold text-ink"><RollingNumber :value="disk" suffix="%" fallback="–"/></span>
            </div>
            <span class="well block h-1.5 overflow-hidden rounded-full">
              <span class="block h-full rounded-full transition-[width] duration-700 ease-ease" :class="meterTone(disk)" :style="{width: `${Math.max(0, Math.min(100, disk || 0))}%`}"></span>
            </span>
            <span class="t-note">{{ formatBytes(diskFree) }} free</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Fall back to plain volume usage when SNMP isn't on. -->
    <div v-else-if="fallback?.configured" class="panel p-4">
      <div class="flex items-baseline justify-between gap-4">
        <span class="t-body">{{ fallback.label }}</span>
        <span class="text-[1.4rem] font-semibold text-ink">{{ fallback.usedPercent ?? 0 }}%</span>
      </div>
      <span class="well mt-3 block h-2 overflow-hidden rounded-full">
        <span
            class="block h-full rounded-full bg-dim transition-[width] duration-700 ease-ease"
            :style="{width: `${fallback.usedPercent || 0}%`}"
        ></span>
      </span>
      <p class="mt-2.5 t-note">
        {{ formatBytes(fallback.usedBytes) }} of {{ formatBytes(fallback.totalBytes) }}
      </p>
    </div>

    <div v-else class="panel p-5">
      <p class="t-body text-ink">NAS metrics are off.</p>
      <p class="mt-1.5 t-note">
        Set <span class="text-dim">NAS_METRICS_MODE=snmp</span> and
        <span class="text-dim">NAS_SNMP_HOST</span> to read processor, memory, storage and network.
      </p>
    </div>
  </section>
</template>

<style scoped>
.status-dot {
  transition: background-color 300ms var(--ease), box-shadow 300ms var(--ease);
}
</style>
