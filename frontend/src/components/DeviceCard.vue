<script setup>
import { useHomeStore } from '../stores/useHomeStore.js';

const props = defineProps({
  device: { type: Object, required: true },
});

const homeStore = useHomeStore();

const icons = {
  light: '💡',
  switch: '🔌',
  fan: '🌀',
  thermostat: '🌡️',
  lock: '🔒',
  sensor: '📡',
};

function toggle() {
  homeStore.toggleDevice(props.device.id, !props.device.state);
}
</script>

<template>
  <button
    @click="toggle"
    class="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-2xl p-4 transition-all duration-200 border"
    :class="device.state ? 'border-amber-500/50' : 'border-gray-700'"
  >
    <div class="flex items-start justify-between mb-3">
      <span class="text-2xl">{{ icons[device.type] || '🏠' }}</span>
      <div
        class="w-9 h-5 rounded-full relative transition-colors duration-200 flex-shrink-0"
        :class="device.state ? 'bg-amber-500' : 'bg-gray-600'"
      >
        <div
          class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
          :class="device.state ? 'translate-x-4' : 'translate-x-0.5'"
        ></div>
      </div>
    </div>
    <div class="text-sm font-medium text-white truncate">{{ device.name }}</div>
    <div class="text-xs mt-1" :class="device.state ? 'text-amber-400' : 'text-gray-500'">
      {{ device.state ? 'On' : 'Off' }}
      <span v-if="device.brightness !== null && device.state"> · {{ device.brightness }}%</span>
    </div>
  </button>
</template>
