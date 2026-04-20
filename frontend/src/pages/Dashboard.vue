<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import WeatherCard from '../components/WeatherCard.vue';
import HomeKitPanel from '../components/HomeKitPanel.vue';
import JellyfinCarousel from '../components/JellyfinCarousel.vue';
import { useWeatherStore } from '../stores/useWeatherStore.js';
import { useHomeStore } from '../stores/useHomeStore.js';
import { useJellyfinStore } from '../stores/useJellyfinStore.js';
import { useGeolocation } from '../composables/useGeolocation.js';

const weatherStore = useWeatherStore();
const homeStore = useHomeStore();
const jellyfinStore = useJellyfinStore();

const { coords, isLoading: geoLoading } = useGeolocation();

const clock = ref('');
const clockInterval = ref(null);

function updateClock() {
  const now = new Date();
  clock.value = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
  jellyfinStore.fetchContinueWatching();
  jellyfinStore.fetchRecentlyAdded();
});

onUnmounted(() => {
  clearInterval(clockInterval.value);
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <header class="flex items-center justify-between px-8 py-6 border-b border-gray-700">
      <h1 class="text-3xl font-bold tracking-tight">🏠 Home Dashboard</h1>
      <div class="text-2xl font-mono text-gray-300">{{ clock }}</div>
    </header>

    <main class="px-8 py-6 space-y-8 max-w-screen-xl mx-auto">
      <!-- Weather Section -->
      <section>
        <h2 class="text-lg font-semibold text-gray-400 uppercase tracking-wider mb-4">Weather</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <WeatherCard
            title="Amsterdam"
            :weather="weatherStore.amsterdamWeather"
            :is-loading="weatherStore.isLoading"
          />
          <WeatherCard
            title="Your Location"
            :weather="weatherStore.locationWeather"
            :is-loading="geoLoading || (!!coords && !weatherStore.locationWeather)"
          />
        </div>
      </section>

      <!-- HomeKit Section -->
      <section>
        <h2 class="text-lg font-semibold text-gray-400 uppercase tracking-wider mb-4">Smart Home</h2>
        <HomeKitPanel />
      </section>

      <!-- Jellyfin Section -->
      <section class="space-y-6">
        <JellyfinCarousel
          title="Continue Watching"
          :items="jellyfinStore.continueWatching"
          :is-loading="jellyfinStore.isLoading"
        />
        <JellyfinCarousel
          title="Recently Added"
          :items="jellyfinStore.recentlyAdded"
          :is-loading="jellyfinStore.isLoading"
        />
      </section>
    </main>
  </div>
</template>
