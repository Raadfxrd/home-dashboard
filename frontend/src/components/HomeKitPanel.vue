<script setup>
import {computed} from 'vue';
import DeviceCard from './DeviceCard.vue';
import {useHomeStore} from '../stores/useHomeStore.js';

const homeStore = useHomeStore();

const onCount = computed(
    () => homeStore.devices.filter((d) => d.canToggle && Boolean(d.state)).length
);
const toggleCount = computed(() => homeStore.devices.filter((d) => d.canToggle).length);
</script>

<template>
  <section class="settle">
    <header class="mb-4 flex items-baseline justify-between gap-4">
      <h2 class="t-section">House</h2>
      <p v-if="!homeStore.isLoading && !homeStore.error" class="t-note t-read">
        {{ onCount }} of {{ toggleCount }} on
      </p>
    </header>

    <div v-if="homeStore.isLoading" class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
      <div v-for="i in 8" :key="i" class="panel h-[132px] animate-pulse"></div>
    </div>

    <div v-else-if="homeStore.error" class="panel flex items-center gap-3 p-4">
      <span class="dot dot-fault"></span>
      <p class="t-body text-ink">{{ homeStore.error }}</p>
    </div>

    <p v-else-if="!homeStore.devices.length" class="panel p-5 t-note">
      No devices are paired yet. Connect Homebridge to see them here.
    </p>

    <div v-else class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
      <DeviceCard
          v-for="device in homeStore.devices"
          :key="device.id"
          :device="device"
          class="min-h-[132px]"
      />
    </div>
  </section>
</template>
