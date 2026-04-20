<script setup>
import {onMounted, onUnmounted, ref, watch} from 'vue';
import {RouterLink} from 'vue-router';
import WeatherCard from '../components/WeatherCard.vue';
import HomeKitPanel from '../components/HomeKitPanel.vue';
import JellyfinCarousel from '../components/JellyfinCarousel.vue';
import AppIcon from '../components/AppIcon.vue';
import {useWeatherStore} from '../stores/useWeatherStore.js';
import {useHomeStore} from '../stores/useHomeStore.js';
import {useJellyfinStore} from '../stores/useJellyfinStore.js';
import {useGeolocation} from '../composables/useGeolocation.js';

const weatherStore = useWeatherStore();
const homeStore = useHomeStore();
const jellyfinStore = useJellyfinStore();

const {coords, isLoading: geoLoading} = useGeolocation();

const clock = ref('');
const clockInterval = ref(null);
const serviceStatusInterval = ref(null);

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

function updateClock() {
  const now = new Date();
  clock.value = now.toLocaleTimeString('nl-NL', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
}

watch(coords, (val) => {
  if (val) {
    weatherStore.fetchLocationWeather(val.lat, val.lon);
  }
});

onMounted(() => {
  updateClock();
  clockInterval.value = setInterval(updateClock, 1000);

  weatherStore.fetchAmsterdamWeather();
  homeStore.fetchDevices();
  homeStore.fetchServiceStatus();
  jellyfinStore.fetchSuggestedWatches();
  jellyfinStore.fetchRecentlyAdded();

  serviceStatusInterval.value = setInterval(() => {
    homeStore.fetchServiceStatus();
  }, 30000);
});

onUnmounted(() => {
  clearInterval(clockInterval.value);
  clearInterval(serviceStatusInterval.value);
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
        <span class="font-mono tabular-nums">{{ clock }}</span>
      </span>
    </header>

    <main
        class="relative z-10 grid flex-1 min-h-0 w-full gap-4 px-4 pb-6 pt-4 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:grid-rows-[auto_minmax(0,1fr)] md:items-stretch md:gap-4 md:px-6 lg:gap-5 lg:px-8 lg:pt-5">

      <section class="glass-section motion-fade-in min-h-0 md:col-start-1 md:row-start-1">
        <p class="glass-section-label mb-3">Weather</p>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
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

      <section class="glass-section motion-fade-in h-fit md:col-start-1 md:row-start-2">
        <p class="glass-section-label mb-3">Home</p>
        <HomeKitPanel/>
      </section>

      <section class="glass-section motion-fade-in h-fit space-y-4 md:col-start-2 md:row-span-2">
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
            :is-loading="jellyfinStore.suggestedLoading"
            :items="jellyfinStore.suggestedWatches"
            :error="jellyfinStore.suggestedError"
            title="Suggested watches"
        />
        <JellyfinCarousel
            :is-loading="jellyfinStore.recentLoading"
            :items="jellyfinStore.recentlyAdded"
            :error="jellyfinStore.recentError"
            title="Recently added"
        />
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

      <div class="group relative">
        <div class="absolute bottom-full left-0 h-2 w-80"></div>
        <div
            :class="statusChipClass(homeStore.serviceStatus.downloadClients.onlineCount > 0, homeStore.serviceStatus.downloadClients.configured)"
            class="glass border px-3 py-2 text-xs shadow-lg"
        >
          {{ summaryLabel(homeStore.serviceStatus.downloadClients, 'Download Clients') }}
        </div>
        <div
            class="absolute bottom-full left-0 mb-2 hidden w-80 max-h-64 overflow-auto rounded-xl border border-white/15 bg-[#0f1014]/95 p-2 text-xs shadow-2xl group-hover:block group-focus-within:block"
        >
          <div v-if="!homeStore.serviceStatus.downloadClients.items?.length" class="px-2 py-1 text-white/60">
            {{ statusLabel(homeStore.serviceStatus.downloadClient) }}
          </div>
          <div v-for="item in homeStore.serviceStatus.downloadClients.items" :key="item.id"
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
