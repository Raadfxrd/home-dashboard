<script setup>
import AppIcon from './AppIcon.vue';

defineProps({
  title: {type: String, required: true},
  weather: {type: Object, default: null},
  isLoading: {type: Boolean, default: false},
});
</script>

<template>
  <div class="glass motion-fade-in min-h-[190px] p-6 flex flex-col gap-5">

    <p class="glass-section-label">{{ title }}</p>

    <template v-if="isLoading">
      <div class="motion-pulse-soft space-y-4">
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

    <template v-else-if="!weather">
      <div class="flex flex-col items-center justify-center flex-1 gap-3 text-white/35">
        <span class="glass-icon-chip">
          <AppIcon :size="20" name="cloudOff"/>
        </span>
        <span class="text-xs tracking-wide">No weather data</span>
      </div>
    </template>

    <template v-else>
      <div class="flex items-center gap-5">
        <img
            :alt="weather.condition"
            :src="`https://openweathermap.org/img/wn/${weather.icon}@2x.png`"
            class="w-16 h-16 flex-shrink-0"
        />
        <div>
          <div class="text-4xl font-semibold tracking-tight">{{ weather.temperature }}°C</div>
          <div class="mt-0.5 text-sm capitalize text-white/55">{{ weather.condition }}</div>
        </div>
      </div>

      <div class="text-sm font-medium text-white/75">{{ weather.city }}</div>

      <div class="glass-divider pt-3 flex gap-5 text-xs text-white/50">
        <span class="flex items-center gap-1.5">
          <AppIcon :size="14" class="text-white/70" name="droplet"/>{{ weather.humidity }}%
        </span>
        <span class="flex items-center gap-1.5">
          <AppIcon :size="14" class="text-white/70" name="wind"/>{{ weather.windSpeed }} km/h
        </span>
      </div>
    </template>

  </div>
</template>
