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
    class="glass w-full text-left rounded-2xl p-4 transition-colors duration-200 outline-none focus-visible:ring-1 focus-visible:ring-white/20"
    :class="device.state ? 'glass-on' : ''"
  >
    <!-- Icon row -->
    <div class="flex items-start justify-between mb-4">
      <span
        class="text-2xl transition-opacity duration-200"
        :class="device.state ? 'opacity-100' : 'opacity-40'"
      >{{ icons[device.type] || '🏠' }}</span>

      <!-- Toggle pill — Apple green when on -->
      <div
        class="w-10 h-[22px] rounded-full relative transition-colors duration-200 flex-shrink-0"
        :style="device.state
          ? 'background: #34c759'
          : 'background: rgba(255,255,255,0.12)'"
      >
        <div
          class="absolute top-[3px] w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200"
          :class="device.state ? 'translate-x-[22px]' : 'translate-x-[3px]'"
        ></div>
      </div>
    </div>

    <!-- Name & status -->
    <div class="text-sm font-medium text-white/90 truncate leading-tight">{{ device.name }}</div>
    <div class="text-xs mt-1.5"
         :class="device.state ? 'text-white/60' : 'text-white/25'">
      {{ device.state ? 'On' : 'Off' }}
      <span v-if="device.brightness !== null && device.state"
            class="text-white/35"> · {{ device.brightness }}%</span>
    </div>
  </button>
</template>
