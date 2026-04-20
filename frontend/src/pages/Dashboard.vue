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
  <!-- Root: deep gradient background -->
  <div class="relative min-h-screen overflow-x-hidden text-white"
       style="background: linear-gradient(135deg, #0d0d1a 0%, #130f2a 35%, #0d1a2a 70%, #0a0a18 100%);">

    <!-- Ambient orbs -->
    <div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div class="orb-1 absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-30"
           style="background: radial-gradient(circle, #7c3aed 0%, transparent 70%); filter: blur(60px);"></div>
      <div class="orb-2 absolute top-1/3 -right-40 w-[600px] h-[600px] rounded-full opacity-20"
           style="background: radial-gradient(circle, #2563eb 0%, transparent 70%); filter: blur(80px);"></div>
      <div class="orb-3 absolute -bottom-40 left-1/3 w-[500px] h-[500px] rounded-full opacity-20"
           style="background: radial-gradient(circle, #0891b2 0%, transparent 70%); filter: blur(70px);"></div>
    </div>

    <!-- Glass header -->
    <header class="glass sticky top-0 z-30 flex items-center justify-between px-8 py-4">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-xl flex items-center justify-center text-lg"
             style="background: linear-gradient(135deg, #7c3aed, #2563eb);">🏠</div>
        <h1 class="text-xl font-semibold tracking-tight">Home Dashboard</h1>
      </div>
      <div class="flex items-center gap-2 text-white/60">
        <span class="text-sm font-mono text-white/80 tabular-nums">{{ clock }}</span>
      </div>
    </header>

    <!-- Main content -->
    <main class="relative z-10 px-6 py-8 space-y-10 max-w-screen-xl mx-auto">

      <!-- Weather -->
      <section>
        <p class="glass-section-label mb-4">Weather</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
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

      <!-- Smart Home -->
      <section>
        <p class="glass-section-label mb-4">Smart Home</p>
        <HomeKitPanel />
      </section>

      <!-- Jellyfin -->
      <section class="space-y-8">
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
