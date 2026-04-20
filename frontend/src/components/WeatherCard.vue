<script setup>
defineProps({
  title: { type: String, required: true },
  weather: { type: Object, default: null },
  isLoading: { type: Boolean, default: false },
});
</script>

<template>
  <div class="glass rounded-2xl p-6 flex flex-col gap-5 min-h-[190px]">

    <p class="glass-section-label">{{ title }}</p>

    <!-- Loading Skeleton -->
    <template v-if="isLoading">
      <div class="animate-pulse space-y-4">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 bg-white/10 rounded-2xl"></div>
          <div class="space-y-2 flex-1">
            <div class="h-8 w-28 bg-white/10 rounded-lg"></div>
            <div class="h-4 w-36 bg-white/10 rounded-lg"></div>
          </div>
        </div>
        <div class="flex gap-4">
          <div class="h-3 w-20 bg-white/10 rounded-lg"></div>
          <div class="h-3 w-20 bg-white/10 rounded-lg"></div>
        </div>
      </div>
    </template>

    <!-- No Data -->
    <template v-else-if="!weather">
      <div class="flex flex-col items-center justify-center flex-1 gap-3 text-white/30">
        <span class="text-4xl opacity-50">🌫️</span>
        <span class="text-xs tracking-wide">No weather data</span>
      </div>
    </template>

    <!-- Weather Data -->
    <template v-else>
      <div class="flex items-center gap-5">
        <img
          :src="`https://openweathermap.org/img/wn/${weather.icon}@2x.png`"
          :alt="weather.condition"
          class="w-16 h-16 flex-shrink-0"
        />
        <div>
          <div class="text-4xl font-bold tracking-tight">{{ weather.temperature }}°C</div>
          <div class="text-sm text-white/50 capitalize mt-0.5">{{ weather.condition }}</div>
        </div>
      </div>

      <div class="text-sm font-medium text-white/70">{{ weather.city }}</div>

      <div class="flex gap-5 text-xs text-white/40">
        <span class="flex items-center gap-1.5">
          <span class="text-blue-400">💧</span>{{ weather.humidity }}%
        </span>
        <span class="flex items-center gap-1.5">
          <span class="text-cyan-400">💨</span>{{ weather.windSpeed }} km/h
        </span>
      </div>
    </template>

  </div>
</template>
