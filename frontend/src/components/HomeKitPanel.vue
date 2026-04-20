<script setup>
import {computed} from 'vue';
import DeviceCard from './DeviceCard.vue';
import {useHomeStore} from '../stores/useHomeStore.js';

const homeStore = useHomeStore();

const rooms = computed(() => Object.entries(homeStore.devices));
const roomOverview = computed(() =>
    rooms.value.map(([room, deviceList]) => ({
      room,
      count: deviceList.length,
    }))
);
</script>

<template>
  <div>
    <div v-if="homeStore.isLoading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      <div
          v-for="i in 8"
          :key="i"
          class="glass motion-pulse-soft p-4 h-28"
      ></div>
    </div>

    <div v-else-if="homeStore.error"
         class="glass p-4 text-red-200/85 border-red-300/25">
      {{ homeStore.error }}
    </div>

    <div v-else class="space-y-7">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div v-for="item in roomOverview" :key="item.room" class="glass p-3">
          <p class="truncate text-xs font-medium text-white/85">{{ item.room }}</p>
          <p class="mt-1 text-[11px] text-white/45">{{ item.count }} accessories</p>
        </div>
      </div>

      <div v-for="[room, deviceList] in rooms" :key="room">
        <p class="glass-section-label mb-3">{{ room }}</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <DeviceCard v-for="device in deviceList" :key="device.id" :device="device"/>
        </div>
      </div>
    </div>
  </div>
</template>
