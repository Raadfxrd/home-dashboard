<script setup>
import {useHomeStore} from '../stores/useHomeStore.js';
import AppIcon from './AppIcon.vue';

const props = defineProps({
  device: {type: Object, required: true},
});

const homeStore = useHomeStore();

const icons = {
  light: 'lightbulb',
  switch: 'power',
  fan: 'fan',
  thermostat: 'thermostat',
  lock: 'lock',
  sensor: 'sensor',
};

function toggle() {
  homeStore.toggleDevice(props.device.id, !props.device.state);
}
</script>

<template>
  <button
      :class="device.state ? 'glass-on' : ''"
      class="glass w-full text-left p-4 motion-fade-in outline-none focus-visible:ring-2 focus-visible:ring-white/25"
      @click="toggle"
  >
    <div class="mb-4 flex items-start justify-between">
      <span
          :class="device.state ? 'text-white' : 'text-white/45'"
          class="glass-icon-chip transition-all duration-200"
      >
        <AppIcon :name="icons[device.type] || 'home'" :size="18"/>
      </span>

      <div
          :style="device.state
          ? 'background: rgba(255,255,255,0.5)'
          : 'background: rgba(255,255,255,0.14)'"
          class="relative h-[24px] w-11 flex-shrink-0 rounded-full transition-colors duration-300"
      >
        <div
            :class="device.state ? 'translate-x-[23px]' : 'translate-x-[3px]'"
            class="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-300"
        ></div>
      </div>
    </div>

    <div class="truncate text-sm font-medium leading-tight text-white/92">{{ device.name }}</div>
    <div :class="device.state ? 'text-white/65' : 'text-white/32'" class="mt-1.5 text-xs">
      {{ device.state ? 'On' : 'Off' }}
      <span v-if="device.brightness !== null && device.state" class="text-white/45"> · {{ device.brightness }}%</span>
    </div>
  </button>
</template>
