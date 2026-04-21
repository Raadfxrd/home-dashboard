<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import {RouterLink} from 'vue-router';
import WeatherCard from '../components/WeatherCard.vue';
import HomeKitPanel from '../components/HomeKitPanel.vue';
import JellyfinCarousel from '../components/JellyfinCarousel.vue';
import AppIcon from '../components/AppIcon.vue';
import RollingNumber from '../components/RollingNumber.vue';
import TinyLineChart from '../components/TinyLineChart.vue';
import {useWeatherStore} from '../stores/useWeatherStore.js';
import {useHomeStore} from '../stores/useHomeStore.js';
import {useJellyfinStore} from '../stores/useJellyfinStore.js';
import {useGeolocation} from '../composables/useGeolocation.js';

const weatherStore = useWeatherStore();
const homeStore = useHomeStore();
const jellyfinStore = useJellyfinStore();

const {coords, isLoading: geoLoading} = useGeolocation();
const DASHBOARD_POLL_INTERVAL_MS = Math.max(1500, Math.min(60000, Number(import.meta.env.VITE_DASHBOARD_POLL_INTERVAL_MS || 1500)));

const clock = ref('');
const clockInterval = ref(null);
const serviceStatusInterval = ref(null);
const jellyfinRefreshInterval = ref(null);
const cpuHistory = ref([]);
const ramHistory = ref([]);
const diskHistory = ref([]);
const rxHistory = ref([]);
const txHistory = ref([]);
const HISTORY_LIMIT = 40;
const JELLYFIN_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

function pushHistory(historyRef, value, limit = HISTORY_LIMIT) {
  if (!Number.isFinite(value)) return;
  const next = [...historyRef.value, value];
  historyRef.value = next.slice(-limit);
}

function shuffledCopy(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const combinedSuggestedItems = computed(() => {
  const merged = [...(jellyfinStore.suggestedWatches || []), ...(jellyfinStore.recommendedShows || [])];
  const byId = new Map();
  for (const item of merged) {
    const key = item?.id ?? item?.Id ?? `${item?.title || item?.name || 'item'}_${byId.size}`;
    if (!byId.has(key)) {
      byId.set(key, item);
    }
  }
  return shuffledCopy(Array.from(byId.values()));
});

const combinedSuggestedLoading = computed(() => jellyfinStore.suggestedLoading || jellyfinStore.recommendedShowsLoading);
const combinedSuggestedError = computed(() => jellyfinStore.suggestedError || jellyfinStore.recommendedShowsError);

function statusLabel(service) {
  if (!service?.configured) return 'Not configured';
  if (service.online) return 'Online';
  return service.error || 'Offline';
}

function statusChipClass(online, configured = true) {
  if (!configured) return 'border-white/20 text-white/70';
  return online ? 'border-emerald-300/35 text-emerald-100' : 'border-amber-300/35 text-amber-100';
}

function summaryLabel(summary, label) {
  if (!summary?.configured) return `${label}: Not configured`;
  return `${label}: ${summary.onlineCount}/${summary.total} online`;
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  const value = Number(bytes);
  if (!Number.isFinite(value)) return '—';
  if (value < 1024) return `${Math.round(value)} B`;

  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let current = value / 1024;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current >= 10 ? current.toFixed(0) : current.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value === 0) return 'now';

  const totalMinutes = Math.floor(value / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${Math.max(1, totalMinutes)}m`;
}

function formatRate(bytesPerSecond) {
  const base = formatBytes(bytesPerSecond);
  return base === '—' ? '—' : `${base}/s`;
}

function downloadStateKind(download) {
  const state = String(download?.state || '').toLowerCase();
  if (state.includes('queued')) return 'queued';
  if (state.includes('stalled')) return 'stalled';
  if (state.includes('downloading') || state.includes('forced') || state.includes('check') || state.includes('meta')) {
    return 'running';
  }
  return 'unknown';
}

function downloadStateSummary(downloads = []) {
  return downloads.reduce((acc, download) => {
    const kind = downloadStateKind(download);
    if (kind === 'queued') {
      acc.queued += 1;
    } else if (kind === 'stalled') {
      acc.stalled += 1;
    } else if (kind === 'running') {
      acc.running += 1;
    }
    return acc;
  }, {running: 0, queued: 0, stalled: 0});
}

function downloadStateStyle(download) {
  const kind = downloadStateKind(download);
  if (kind === 'running') return {
    borderColor: 'rgba(125, 211, 252, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)'
  };
  if (kind === 'queued') return {borderColor: 'rgba(252, 211, 77, 0.4)', backgroundColor: 'rgba(255, 255, 255, 0.04)'};
  if (kind === 'stalled') return {
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)'
  };
  return {borderColor: 'rgba(255, 255, 255, 0.10)', backgroundColor: 'rgba(255, 255, 255, 0.03)'};
}

function downloadProgressStyle(progress) {
  const value = Number(progress);
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;

  let from = '#60a5fa';
  let to = '#38bdf8';
  if (normalized >= 90) {
    from = '#22c55e';
    to = '#86efac';
  } else if (normalized >= 75) {
    from = '#84cc16';
    to = '#22c55e';
  } else if (normalized >= 40) {
    from = '#f59e0b';
    to = '#fde047';
  }

  return {
    width: `${normalized}%`,
    background: `linear-gradient(90deg, ${from} 0%, ${to} 100%)`,
    boxShadow: '0 0 14px rgba(255, 255, 255, 0.08)',
  };
}

function usageFillStyle(percent) {
  const value = Number(percent);
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;

  let from = 'rgba(16, 185, 129, 0.45)';
  let via = 'rgba(52, 211, 153, 0.18)';
  if (normalized >= 90) {
    from = 'rgba(244, 63, 94, 0.5)';
    via = 'rgba(251, 113, 133, 0.22)';
  } else if (normalized >= 75) {
    from = 'rgba(245, 158, 11, 0.48)';
    via = 'rgba(251, 191, 36, 0.2)';
  }

  return {
    height: `${normalized}%`,
    background: `linear-gradient(to top, ${from} 0%, ${via} 60%, rgba(255, 255, 255, 0) 100%)`,
  };
}

function updateClock() {
  const now = new Date();
  clock.value = now.toLocaleTimeString('nl-NL', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
}

watch(coords, (val) => {
  if (val) {
    weatherStore.fetchLocationWeather(val.lat, val.lon);
  }
});

watch(
    () => ({
      cpu: homeStore.serviceStatus.nasMetrics.cpu?.usagePercent,
      ram: homeStore.serviceStatus.nasMetrics.memory?.usedPercent,
      disk: homeStore.serviceStatus.nasMetrics.disk?.usedPercent,
      rx: homeStore.serviceStatus.nasMetrics.network?.totalRxRateBytesPerSecond,
      tx: homeStore.serviceStatus.nasMetrics.network?.totalTxRateBytesPerSecond,
      configured: homeStore.serviceStatus.nasMetrics.configured,
    }),
    (sample) => {
      if (!sample.configured) return;
      pushHistory(cpuHistory, Number(sample.cpu));
      pushHistory(ramHistory, Number(sample.ram));
      pushHistory(diskHistory, Number(sample.disk));
      pushHistory(rxHistory, Number(sample.rx));
      pushHistory(txHistory, Number(sample.tx));
    }
);

onMounted(async () => {
  updateClock();
  clockInterval.value = setInterval(updateClock, 1000);

  await weatherStore.fetchAmsterdamWeather();
  await homeStore.fetchDevices();
  await homeStore.fetchServiceStatus();
  await jellyfinStore.fetchSuggestedWatches();
  await jellyfinStore.fetchRecommendedShows();
  await jellyfinStore.fetchRecentlyAdded();

  jellyfinRefreshInterval.value = setInterval(() => {
    jellyfinStore.fetchSuggestedWatches();
    jellyfinStore.fetchRecommendedShows();
    jellyfinStore.fetchRecentlyAdded();
  }, JELLYFIN_REFRESH_INTERVAL_MS);

  serviceStatusInterval.value = setInterval(() => {
    homeStore.fetchServiceStatus();
  }, DASHBOARD_POLL_INTERVAL_MS);
});

onUnmounted(() => {
  clearInterval(clockInterval.value);
  clearInterval(serviceStatusInterval.value);
  clearInterval(jellyfinRefreshInterval.value);
});
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-x-hidden text-white">
    <div class="pointer-events-none absolute inset-0 opacity-90"/>

    <header
        class="glass glass-elevated motion-fade-in sticky top-3 z-30 mx-3 mt-3 flex items-center justify-between px-4 py-3 md:mx-6 md:px-6 md:py-4">
      <div class="flex items-center gap-3">
        <span class="glass-icon-chip">
          <AppIcon :size="18" name="home"/>
        </span>
        <div>
          <h1 class="text-lg font-semibold tracking-tight md:text-xl">Home</h1>
        </div>
      </div>
      <span
          class="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 md:text-sm">
        <AppIcon :size="14" class="text-white/65" name="clock"/>
        <RollingNumber class="font-mono tabular-nums" :value="clock" fallback="--:--:--"/>
      </span>
    </header>

    <main
        class="relative z-10 w-full flex-1 px-3 pb-4 pt-3 md:columns-2 md:gap-3 md:px-5 md:pt-4 lg:px-6 lg:pt-4">

      <section class="glass-section masonry-item motion-fade-in mb-3 h-fit">
        <p class="glass-section-label mb-2">Weather</p>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <WeatherCard
              :is-loading="weatherStore.isLoading"
              :weather="weatherStore.amsterdamWeather"
              title="Amsterdam"
          />
          <WeatherCard
              :is-loading="geoLoading || (!!coords && !weatherStore.locationWeather)"
              :weather="weatherStore.locationWeather"
              title="Your Location"
          />
        </div>
      </section>

      <section class="glass-section masonry-item motion-fade-in mb-3 h-fit min-h-0">
        <p class="glass-section-label mb-2">Home</p>
        <HomeKitPanel/>
      </section>

      <section class="glass-section masonry-item motion-fade-in mb-3 min-h-0">
        <div class="mb-2 flex items-center justify-between gap-3">
          <p class="glass-section-label">Download activity</p>
          <span
              class="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/45">
            {{ summaryLabel(homeStore.serviceStatus.downloadActivity, 'Downloads') }}
          </span>
        </div>

        <div v-if="homeStore.serviceStatus.downloadActivity.items?.length" class="grid gap-2.5 sm:grid-cols-2">
          <article
              v-for="client in homeStore.serviceStatus.downloadActivity.items"
              :key="client.id || client.name"
              class="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-sm font-medium text-white/90">{{ client.name }}</div>
                <div :class="client.online ? 'text-emerald-200' : 'text-amber-200'" class="mt-0.5 text-[11px]">
                  {{ client.online ? 'Online' : client.error || 'Offline' }}
                </div>
              </div>
              <div class="flex flex-col items-end gap-1">
                <div class="flex flex-wrap justify-end gap-1">
                  <span
                      class="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/55">
                    {{ client.downloads?.length || 0 }} active
                  </span>
                  <span v-if="downloadStateSummary(client.downloads).running"
                        class="rounded-full border border-sky-300/20 bg-sky-400/15 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-sky-100">
                    {{ downloadStateSummary(client.downloads).running }} running
                  </span>
                  <span v-if="downloadStateSummary(client.downloads).queued"
                        class="rounded-full border border-amber-300/20 bg-amber-400/15 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-amber-100">
                    {{ downloadStateSummary(client.downloads).queued }} queued
                  </span>
                  <span v-if="downloadStateSummary(client.downloads).stalled"
                        class="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/65">
                    {{ downloadStateSummary(client.downloads).stalled }} stalled
                  </span>
                </div>
              </div>
            </div>

            <div v-if="client.downloads?.length" class="mt-2.5 max-h-80 space-y-2 overflow-y-auto pr-1">
              <div v-for="download in client.downloads" :key="download.id || download.name"
                   :style="downloadStateStyle(download)"
                   class="space-y-1.5 rounded-xl border p-2.5 transition-colors duration-300">
                <div class="flex items-center justify-between gap-3 text-xs">
                  <span class="truncate text-white/90">{{ download.name }}</span>
                  <span class="shrink-0 text-white/45">{{ download.progress }}%</span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div class="h-full rounded-full transition-all duration-300"
                       :style="downloadProgressStyle(download.progress)"></div>
                </div>
                <div class="flex items-center justify-between gap-3 text-[10px] text-white/40">
                  <span>{{ formatBytes(download.speedBytesPerSecond) }}/s</span>
                  <span>{{ formatDuration(download.etaSeconds) }}</span>
                </div>
              </div>
            </div>

            <div v-else class="mt-3 text-xs text-white/35">No active downloads right now.</div>
          </article>
        </div>

        <div v-else class="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/35">
          No download activity detected yet.
        </div>
      </section>

      <section class="glass-section masonry-item motion-fade-in mb-3 h-fit min-h-0 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <p class="glass-section-label">Media</p>
          <RouterLink
              class="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/70 hover:bg-white/[0.12]"
              to="/media/movies"
          >
            Browse Library
          </RouterLink>
        </div>
        <JellyfinCarousel
            :is-loading="combinedSuggestedLoading"
            :items="combinedSuggestedItems"
            :error="combinedSuggestedError"
            title="Suggested movies"
        />
        <JellyfinCarousel
            :is-loading="jellyfinStore.recentLoading"
            :items="jellyfinStore.recentlyAdded"
            :error="jellyfinStore.recentError"
            title="Recently added"
        />
      </section>
      <section class="glass-section masonry-item motion-fade-in mb-3 min-h-0">
        <div class="mb-2 flex items-center justify-between gap-3">
          <p class="glass-section-label">NAS usage</p>
        </div>

        <div v-if="homeStore.serviceStatus.nasMetrics.configured" class="space-y-3">
          <div class="grid grid-cols-2 gap-2.5">
            <article class="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div class="text-[10px] uppercase tracking-[0.12em] text-white/45">CPU</div>
              <RollingNumber
                  class="mt-1 text-xl font-semibold text-white/95"
                  :value="homeStore.serviceStatus.nasMetrics.cpu.usagePercent"
                  suffix="%"
              />
              <TinyLineChart
                  :datasets="[{data: cpuHistory, borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.22)'}]"
                  :y-max="100"
              />
            </article>
            <article class="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div class="text-[10px] uppercase tracking-[0.12em] text-white/45">RAM</div>
              <RollingNumber
                  class="mt-1 text-xl font-semibold text-white/95"
                  :value="homeStore.serviceStatus.nasMetrics.memory.usedPercent"
                  suffix="%"
              />
              <TinyLineChart
                  :datasets="[{data: ramHistory, borderColor: '#a78bfa', backgroundColor: 'rgba(167, 139, 250, 0.22)'}]"
                  :y-max="100"
              />
              <div class="mt-1 text-[11px] text-white/45">
                {{ formatBytes(homeStore.serviceStatus.nasMetrics.memory.usedBytes) }} /
                {{ formatBytes(homeStore.serviceStatus.nasMetrics.memory.totalBytes) }}
              </div>
            </article>
            <article class="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div
                  class="pointer-events-none absolute inset-x-0 bottom-0 transition-all duration-700"
                  :style="usageFillStyle(homeStore.serviceStatus.nasMetrics.disk.usedPercent)"
              ></div>
              <div class="relative z-10">
                <div class="text-[10px] uppercase tracking-[0.12em] text-white/45">Disk</div>
                <RollingNumber
                    class="mt-1 text-xl font-semibold text-white/95"
                    :value="homeStore.serviceStatus.nasMetrics.disk.usedPercent"
                    suffix="%"
                />
                <div class="mt-1 text-[11px] text-white/45">
                  {{ formatBytes(homeStore.serviceStatus.nasMetrics.disk.usedBytes) }} /
                  {{ formatBytes(homeStore.serviceStatus.nasMetrics.disk.totalBytes) }}
                </div>
              </div>
            </article>
            <article class="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div class="text-[10px] uppercase tracking-[0.12em] text-white/45">Network</div>
              <div class="mt-1 text-sm font-semibold text-white/90">
                <RollingNumber
                    :value="formatRate(homeStore.serviceStatus.nasMetrics.network.totalRxRateBytesPerSecond)"/>
                in
              </div>
              <div class="text-[11px] text-white/55">
                <RollingNumber
                    :value="formatRate(homeStore.serviceStatus.nasMetrics.network.totalTxRateBytesPerSecond)"/>
                out
              </div>
              <TinyLineChart
                  :datasets="[
                    {label: 'In', data: rxHistory, borderColor: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.14)'},
                    {label: 'Out', data: txHistory, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.10)', fill: false}
                  ]"
              />
            </article>
          </div>

          <div v-if="homeStore.serviceStatus.nasMetrics.network.interfaces?.length" class="space-y-1.5">
            <div v-for="iface in homeStore.serviceStatus.nasMetrics.network.interfaces" :key="iface.name"
                 class="flex items-center justify-between rounded-xl bg-black/10 px-3 py-2 text-[11px]">
              <span class="text-white/80">{{ iface.name }}</span>
              <span class="text-white/45">
                <RollingNumber :value="formatRate(iface.rxRateBytesPerSecond)"/> in · <RollingNumber
                  :value="formatRate(iface.txRateBytesPerSecond)"/> out
              </span>
            </div>
          </div>
        </div>

        <div v-else-if="homeStore.serviceStatus.nasUsage.configured" class="space-y-3">
          <div class="flex items-end justify-between gap-4">
            <div>
              <div class="text-3xl font-semibold tracking-tight text-white/95">
                {{ homeStore.serviceStatus.nasUsage.usedPercent ?? 0 }}%
              </div>
              <div class="mt-1 text-xs text-white/45">
                {{ homeStore.serviceStatus.nasUsage.label }} · {{ homeStore.serviceStatus.nasUsage.path }}
              </div>
            </div>
            <div class="text-right text-[11px] text-white/50">
              <div>{{ formatBytes(homeStore.serviceStatus.nasUsage.usedBytes) }} used</div>
              <div>{{ formatBytes(homeStore.serviceStatus.nasUsage.freeBytes) }} free</div>
              <div>{{ formatBytes(homeStore.serviceStatus.nasUsage.totalBytes) }} total</div>
            </div>
          </div>

          <div class="h-2 overflow-hidden rounded-full bg-white/10">
            <div
                class="h-full rounded-full bg-white/80 transition-all duration-300"
                :style="{width: `${homeStore.serviceStatus.nasUsage.usedPercent || 0}%`}"
            ></div>
          </div>
        </div>

        <div v-else class="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/35">
          Set `NAS_METRICS_MODE=snmp` and `NAS_SNMP_HOST` to show live NAS CPU/RAM/disk/network usage.
        </div>
      </section>
    </main>

    <div class="fixed bottom-4 left-4 z-50 flex w-[min(96vw,560px)] flex-wrap gap-2">
      <div class="group relative">
        <div class="absolute bottom-full left-0 h-2 w-80"></div>
        <div
            :class="statusChipClass(homeStore.serviceStatus.indexers.onlineCount > 0, homeStore.serviceStatus.indexers.configured)"
            class="glass border px-3 py-2 text-xs shadow-lg"
        >
          {{ summaryLabel(homeStore.serviceStatus.indexers, 'Indexers') }}
        </div>
        <div
            class="absolute bottom-full left-0 mb-2 hidden w-80 max-h-64 overflow-auto rounded-xl border border-white/15 bg-[#0f1014]/95 p-2 text-xs shadow-2xl group-hover:block group-focus-within:block"
        >
          <div v-if="!homeStore.serviceStatus.indexers.items?.length" class="px-2 py-1 text-white/60">
            {{ statusLabel(homeStore.serviceStatus.indexer) }}
          </div>
          <div v-for="item in homeStore.serviceStatus.indexers.items" :key="item.id"
               class="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
            <span class="truncate text-white/85">{{ item.name }}</span>
            <span :class="item.online ? 'text-emerald-200' : 'text-amber-200'" class="shrink-0 text-[11px]">
              {{ item.online ? 'Online' : 'Offline' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="fixed bottom-4 right-4 z-50 flex w-[min(92vw,320px)] flex-col gap-2">
      <div
          v-for="item in homeStore.notifications"
          :key="item.id"
          :class="item.type === 'error' ? 'border-red-300/35 text-red-100' : 'border-emerald-300/35 text-emerald-100'"
          class="glass border px-3 py-2 text-xs shadow-lg motion-fade-in"
      >
        {{ item.message }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.masonry-item {
  break-inside: avoid;
  -webkit-column-break-inside: avoid;
  page-break-inside: avoid;
}
</style>
