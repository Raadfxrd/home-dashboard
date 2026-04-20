<script setup>
defineProps({
  title: { type: String, required: true },
  weather: { type: Object, default: null },
  isLoading: { type: Boolean, default: false },
});
</script>

<template>
  <div class="bg-gray-800 rounded-2xl p-6 flex flex-col gap-4 min-h-[180px]">
    <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider">{{ title }}</h3>

    <!-- Loading Skeleton -->
    <template v-if="isLoading">
      <div class="animate-pulse space-y-3">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 bg-gray-700 rounded-full"></div>
          <div class="space-y-2">
            <div class="h-8 w-24 bg-gray-700 rounded"></div>
            <div class="h-4 w-32 bg-gray-700 rounded"></div>
          </div>
        </div>
        <div class="flex gap-4">
          <div class="h-4 w-20 bg-gray-700 rounded"></div>
          <div class="h-4 w-20 bg-gray-700 rounded"></div>
        </div>
      </div>
    </template>

    <!-- No Data -->
    <template v-else-if="!weather">
      <div class="flex flex-col items-center justify-center flex-1 text-gray-500 gap-2">
        <span class="text-3xl">🌫️</span>
        <span class="text-sm">No weather data</span>
      </div>
    </template>

    <!-- Weather Data -->
    <template v-else>
      <div class="flex items-center gap-4">
        <img
          :src="`https://openweathermap.org/img/wn/${weather.icon}@2x.png`"
          :alt="weather.condition"
          class="w-16 h-16"
        />
        <div>
          <div class="text-4xl font-bold">{{ weather.temperature }}°C</div>
          <div class="text-gray-400 capitalize">{{ weather.condition }}</div>
        </div>
      </div>
      <div class="text-sm font-medium text-gray-300">{{ weather.city }}</div>
      <div class="flex gap-6 text-sm text-gray-400">
        <span>💧 {{ weather.humidity }}%</span>
        <span>💨 {{ weather.windSpeed }} km/h</span>
      </div>
    </template>
  </div>
</template>
