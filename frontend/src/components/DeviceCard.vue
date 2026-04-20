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
    class="glass glass-hover w-full text-left rounded-2xl p-4 transition-all duration-250 outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    :class="device.state ? 'glass-active' : ''"
  >
    <!-- Icon row -->
    <div class="flex items-start justify-between mb-4">
      <!-- Device icon with glow when active -->
      <span
        class="text-2xl transition-all duration-300"
        :class="device.state ? 'drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'opacity-50'"
      >{{ icons[device.type] || '🏠' }}</span>

      <!-- Toggle pill -->
      <div
        class="w-10 h-[22px] rounded-full relative transition-all duration-300 flex-shrink-0 cursor-pointer"
        :class="device.state
          ? 'shadow-[0_0_12px_rgba(139,92,246,0.6)]'
          : ''"
        :style="device.state
          ? 'background: linear-gradient(135deg, #7c3aed, #6d28d9)'
          : 'background: rgba(255,255,255,0.12)'"
      >
        <div
          class="absolute top-[3px] w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-300"
          :class="device.state ? 'translate-x-[22px]' : 'translate-x-[3px]'"
        ></div>
      </div>
    </div>

    <!-- Name & status -->
    <div class="text-sm font-medium text-white/90 truncate leading-tight">{{ device.name }}</div>
    <div class="text-xs mt-1.5 font-medium"
         :class="device.state ? 'text-violet-300' : 'text-white/30'">
      {{ device.state ? 'On' : 'Off' }}
      <span v-if="device.brightness !== null && device.state"
            class="text-white/40"> · {{ device.brightness }}%</span>
    </div>
  </button>
</template>
