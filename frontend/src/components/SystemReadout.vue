<script setup>
import {computed} from 'vue';
import Sparkline from './Sparkline.vue';
import RollingNumber from './RollingNumber.vue';

/**
 * The NAS, read as an instrument rather than four KPI cards: one row per
 * measure, labels left, values right in a single aligned column, the trace
 * between them. Aligned numbers are scannable in a way scattered ones
 * aren't — and on this screen the numbers are the content.
 */
const props = defineProps({
  metrics: {type: Object, required: true},
  fallback: {type: Object, default: null},
  cpuHistory: {type: Array, default: () => []},
  ramHistory: {type: Array, default: () => []},
  rxHistory: {type: Array, default: () => []},
  txHistory: {type: Array, default: () => []},
});

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  const value = Number(bytes);
  if (!Number.isFinite(value)) return '—';
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

/* A measure is only worth colouring once it's actually a problem. */
function tone(percent) {
  if (!Number.isFinite(percent)) return 'var(--text-dim)';
  if (percent >= 90) return 'var(--fault)';
  if (percent >= 75) return 'var(--warn)';
  return 'var(--text-dim)';
}

const cpu = computed(() => props.metrics?.cpu?.usagePercent);
const ram = computed(() => props.metrics?.memory?.usedPercent);
const disk = computed(() => props.metrics?.disk?.usedPercent);
const rx = computed(() => props.metrics?.network?.totalRxRateBytesPerSecond);
const tx = computed(() => props.metrics?.network?.totalTxRateBytesPerSecond);
</script>

<template>
  <section class="settle">
    <header class="mb-4 flex items-baseline justify-between gap-4">
      <h2 class="t-section">System</h2>
      <p v-if="metrics.configured" class="t-note">{{ metrics.label || 'NAS' }}</p>
    </header>

    <div v-if="metrics.configured" class="panel divide-y divide-line-soft">
      <!-- Processor -->
      <div class="flex items-center gap-4 px-4 py-3.5">
        <span class="w-20 shrink-0 t-body">Processor</span>
        <span class="h-7 min-w-0 flex-1">
          <Sparkline :values="cpuHistory" :max="100" :height="26" :tone="tone(cpu)"/>
        </span>
        <span class="t-read w-[4.75rem] shrink-0 text-right text-[0.95rem] text-ink">
          <RollingNumber :value="cpu" suffix="%"/>
        </span>
      </div>

      <!-- Memory -->
      <div class="flex items-center gap-4 px-4 py-3.5">
        <span class="w-20 shrink-0 t-body">
          Memory
          <span class="mt-0.5 block t-note text-[0.75rem]">
            {{ formatBytes(metrics.memory?.usedBytes) }}
          </span>
        </span>
        <span class="h-7 min-w-0 flex-1">
          <Sparkline :values="ramHistory" :max="100" :height="26" :tone="tone(ram)"/>
        </span>
        <span class="t-read w-[4.75rem] shrink-0 text-right text-[0.95rem] text-ink">
          <RollingNumber :value="ram" suffix="%"/>
        </span>
      </div>

      <!-- Storage. A bar, not a trace — it doesn't move minute to minute. -->
      <div class="flex items-center gap-4 px-4 py-3.5">
        <span class="w-20 shrink-0 t-body">
          Storage
          <span class="mt-0.5 block t-note text-[0.75rem]">
            {{ formatBytes(metrics.disk?.freeBytes) }} free
          </span>
        </span>
        <span class="min-w-0 flex-1">
          <span class="well block h-2 overflow-hidden rounded-full">
            <span
                class="block h-full rounded-full transition-[width] duration-700 ease-ease"
                :style="{width: `${Math.max(0, Math.min(100, disk || 0))}%`, background: tone(disk)}"
            ></span>
          </span>
        </span>
        <span class="t-read w-[4.75rem] shrink-0 text-right text-[0.95rem] text-ink">
          <RollingNumber :value="disk" suffix="%"/>
        </span>
      </div>

      <!-- Network. Two traces share one row because in and out are one story. -->
      <div class="flex items-center gap-4 px-4 py-3.5">
        <span class="w-20 shrink-0 t-body">Network</span>
        <span class="relative h-7 min-w-0 flex-1">
          <span class="absolute inset-0"><Sparkline :values="rxHistory" :height="26" tone="var(--text-dim)"/></span>
          <span class="absolute inset-0"><Sparkline :values="txHistory" :height="26" tone="var(--line)"/></span>
        </span>
        <span class="w-[4.75rem] shrink-0 text-right">
          <span class="t-read block text-[0.95rem] leading-tight text-ink">{{ formatBytes(rx) }}/s</span>
          <span class="t-read block text-[0.75rem] leading-tight text-faint">{{ formatBytes(tx) }}/s</span>
        </span>
      </div>

      <div
          v-if="metrics.network?.interfaces?.length"
          class="flex flex-wrap gap-x-5 gap-y-1 px-4 py-3 t-note"
      >
        <span v-for="iface in metrics.network.interfaces" :key="iface.name" class="t-read">
          {{ iface.name }} {{ formatBytes(iface.rxRateBytesPerSecond) }}/s in
        </span>
      </div>
    </div>

    <!-- Fall back to plain volume usage when SNMP isn't on. -->
    <div v-else-if="fallback?.configured" class="panel p-4">
      <div class="flex items-baseline justify-between gap-4">
        <span class="t-body">{{ fallback.label }}</span>
        <span class="t-read text-[1.4rem] text-ink">{{ fallback.usedPercent ?? 0 }}%</span>
      </div>
      <span class="well mt-3 block h-2 overflow-hidden rounded-full">
        <span
            class="block h-full rounded-full bg-dim transition-[width] duration-700 ease-ease"
            :style="{width: `${fallback.usedPercent || 0}%`}"
        ></span>
      </span>
      <p class="mt-2.5 t-note t-read">
        {{ formatBytes(fallback.usedBytes) }} of {{ formatBytes(fallback.totalBytes) }}
      </p>
    </div>

    <div v-else class="panel p-5">
      <p class="t-body text-ink">NAS metrics are off.</p>
      <p class="mt-1.5 t-note">
        Set <span class="t-read text-dim">NAS_METRICS_MODE=snmp</span> and
        <span class="t-read text-dim">NAS_SNMP_HOST</span> to read CPU, memory, storage and network.
      </p>
    </div>
  </section>
</template>
