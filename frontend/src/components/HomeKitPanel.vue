<script setup>
import DeviceCard from './DeviceCard.vue';
import {useHomeStore} from '../stores/useHomeStore.js';

const homeStore = useHomeStore();
</script>

<template>
  <div>
    <div v-if="homeStore.isLoading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      <div
          v-for="i in 8"
          :key="i"
          class="glass motion-pulse-soft h-24 p-3"
      ></div>
    </div>

    <div v-else-if="homeStore.error"
         class="glass p-4 text-red-200/85 border-red-300/25">
      {{ homeStore.error }}
    </div>

    <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      <DeviceCard v-for="device in homeStore.devices" :key="device.id" :device="device"/>
    </div>
  </div>
</template>
