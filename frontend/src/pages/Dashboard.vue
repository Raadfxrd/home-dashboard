<script setup>
import {onMounted, onUnmounted, ref, watch} from 'vue';
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
  jellyfinStore.fetchSuggestedWatches();
  jellyfinStore.fetchRecentlyAdded();
});

onUnmounted(() => {
  clearInterval(clockInterval.value);
});
</script>

<template>
  <div class="relative min-h-screen overflow-x-hidden text-white">
    <div class="pointer-events-none absolute inset-0 opacity-90"/>

    <header
        class="glass glass-elevated motion-fade-in sticky top-3 z-30 mx-3 mt-3 flex items-center justify-between px-4 py-3 md:mx-6 md:px-6 md:py-4">
      <div class="flex items-center gap-3">
        <span class="glass-icon-chip">
          <AppIcon :size="18" name="home"/>
        </span>
        <div>
          <h1 class="text-lg font-semibold tracking-tight md:text-xl">Home Dashboard</h1>
          <p class="text-xs text-white/45">Control center</p>
        </div>
      </div>
      <span
          class="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 md:text-sm">
        <AppIcon :size="14" class="text-white/65" name="clock"/>
        <span class="font-mono tabular-nums">{{ clock }}</span>
      </span>
    </header>

    <main class="relative z-10 mx-auto max-w-screen-xl space-y-8 px-4 pb-10 pt-8 md:px-6">

      <section class="glass-section motion-fade-in">
        <p class="glass-section-label mb-4">Weather</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
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

      <section class="glass-section motion-fade-in">
        <p class="glass-section-label mb-4">Smart Home</p>
        <HomeKitPanel/>
      </section>

      <section class="glass-section motion-fade-in space-y-8">
        <p class="glass-section-label">Media</p>
        <JellyfinCarousel
            :is-loading="jellyfinStore.suggestedLoading"
            :items="jellyfinStore.suggestedWatches"
            :error="jellyfinStore.suggestedError"
            title="Suggested Watches"
        />
        <JellyfinCarousel
            :is-loading="jellyfinStore.recentLoading"
            :items="jellyfinStore.recentlyAdded"
            :error="jellyfinStore.recentError"
            title="Recently Added"
        />
      </section>

    </main>

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
