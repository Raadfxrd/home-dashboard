<script setup>
import { computed } from 'vue';
import DeviceCard from './DeviceCard.vue';
import { useHomeStore } from '../stores/useHomeStore.js';

const homeStore = useHomeStore();

const rooms = computed(() => Object.entries(homeStore.devices));
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="homeStore.isLoading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      <div
        v-for="i in 8"
        :key="i"
        class="glass rounded-2xl p-4 animate-pulse h-28"
      ></div>
    </div>

    <!-- Error -->
    <div v-else-if="homeStore.error"
         class="glass rounded-xl p-4 text-red-300/80 border-red-500/20">
      {{ homeStore.error }}
    </div>

    <!-- Devices by Room -->
    <div v-else class="space-y-7">
      <div v-for="[room, deviceList] in rooms" :key="room">
        <p class="glass-section-label mb-3">{{ room }}</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <DeviceCard v-for="device in deviceList" :key="device.id" :device="device" />
        </div>
      </div>
    </div>
  </div>
</template>
