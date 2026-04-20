<script setup>
import AppIcon from './AppIcon.vue';

defineProps({
  title: {type: String, required: true},
  weather: {type: Object, default: null},
  isLoading: {type: Boolean, default: false},
});
</script>

<template>
  <div class="glass motion-fade-in min-h-[168px] flex flex-col gap-4 p-4 md:p-5">

    <p class="glass-section-label">{{ title }}</p>

    <template v-if="isLoading">
      <div class="motion-pulse-soft space-y-3.5">
        <div class="flex items-center gap-3.5">
          <div class="h-14 w-14 rounded-2xl bg-white/10"></div>
          <div class="space-y-2 flex-1">
            <div class="h-7 w-24 rounded-lg bg-white/10"></div>
            <div class="h-4 w-32 rounded-lg bg-white/10"></div>
          </div>
        </div>
        <div class="flex gap-3.5">
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
      <div class="flex items-center gap-4">
        <img
            :alt="weather.condition"
            :src="`https://openweathermap.org/img/wn/${weather.icon}@2x.png`"
            class="h-14 w-14 flex-shrink-0"
        />
        <div>
          <div class="text-3xl font-semibold tracking-tight md:text-4xl">{{ weather.temperature }}°C</div>
          <div class="mt-0.5 text-xs capitalize text-white/55 md:text-sm">{{ weather.condition }}</div>
        </div>
      </div>

      <div class="text-xs font-medium text-white/75 md:text-sm">{{ weather.city }}</div>

      <div class="glass-divider flex gap-4 pt-2.5 text-[11px] text-white/50 md:text-xs">
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
