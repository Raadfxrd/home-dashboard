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
        class="bg-gray-800 rounded-2xl p-4 animate-pulse h-28"
      ></div>
    </div>

    <!-- Error -->
    <div v-else-if="homeStore.error" class="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300">
      {{ homeStore.error }}
    </div>

    <!-- Devices by Room -->
    <div v-else class="space-y-6">
      <div v-for="[room, deviceList] in rooms" :key="room">
        <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{{ room }}</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <DeviceCard v-for="device in deviceList" :key="device.id" :device="device" />
        </div>
      </div>
    </div>
  </div>
</template>
