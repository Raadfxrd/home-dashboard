<script setup>
import {computed} from 'vue';
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


function onBrightnessInput(event) {
  homeStore.setBrightness(props.device.id, event.target.value);
}

function onColorInput(event) {
  homeStore.setColor(props.device.id, event.target.value);
}

function hexToRgba(hex, alpha) {
  if (typeof hex !== 'string') return `rgba(255, 208, 128, ${alpha})`;
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(255, 208, 128, ${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const fillPercent = computed(() => {
  if (!props.device.state) return 0;
  if (typeof props.device.brightness === 'number') {
    return Math.max(0, Math.min(100, props.device.brightness));
  }
  return 100;
});

const accentColor = computed(() => props.device.color || '#ffd080');

const isOn = computed(() => {
  const value = props.device.state;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
  }
  return Boolean(value);
});

const tileFillStyle = computed(() => ({
  background: `linear-gradient(0deg, ${hexToRgba(accentColor.value, 0.46)} 0%, ${hexToRgba(accentColor.value, 0.46)} ${fillPercent.value}%, rgba(255, 255, 255, 0.03) ${fillPercent.value}%, rgba(255, 255, 255, 0.03) 100%)`,
}));
</script>

<template>
  <div :class="isOn ? 'glass-on' : ''" class="glass relative w-full overflow-hidden p-4 motion-fade-in">
    <div class="pointer-events-none absolute inset-0 transition-all duration-300" :style="tileFillStyle"/>

    <div class="relative z-10 mb-4 flex items-start justify-between">
      <span
          :class="isOn ? 'text-white' : 'text-white/45'"
          class="glass-icon-chip transition-all duration-200"
      >
        <AppIcon :name="icons[device.type] || 'home'" :size="18"/>
      </span>

      <button
          v-if="device.canToggle"
          :style="isOn
          ? 'background: rgba(255,255,255,0.5)'
          : 'background: rgba(255,255,255,0.14)'"
          class="relative h-[24px] w-11 flex-shrink-0 rounded-full outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-white/25"
          @click="homeStore.toggleDevice(props.device.id, !isOn)"
      >
        <span
            :class="isOn ? 'translate-x-[20px]' : 'translate-x-0'"
            class="absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-300"
        ></span>
      </button>

      <span v-else class="text-[10px] uppercase tracking-[0.14em] text-white/45">{{ device.type }}</span>
    </div>

    <div class="relative z-10 truncate text-sm font-medium leading-tight text-white/92">{{ device.name }}</div>
    <div :class="isOn ? 'text-white/65' : 'text-white/32'" class="relative z-10 mt-1.5 text-xs">
      {{ isOn ? 'On' : 'Off' }}
      <span v-if="device.brightness !== null && isOn" class="text-white/45"> · {{ device.brightness }}%</span>
    </div>

    <div v-if="device.type === 'light' && device.supportsBrightness" class="relative z-10 mt-3">
      <label class="mb-1 block text-[10px] uppercase tracking-[0.16em] text-white/45">Brightness</label>
      <input
          :value="device.brightness ?? 0"
          class="w-full accent-white/80"
          max="100"
          min="0"
          type="range"
          @click.stop
          @input="onBrightnessInput"
      />
    </div>

    <div v-if="device.type === 'light' && device.supportsColor"
         class="relative z-10 mt-3 flex items-center justify-between gap-3">
      <span class="text-[10px] uppercase tracking-[0.16em] text-white/45">Color</span>
      <input
          :value="device.color || '#ffffff'"
          class="h-8 w-12 cursor-pointer rounded-md border border-white/20 bg-transparent p-0"
          type="color"
          @click.stop
          @input="onColorInput"
      />
    </div>
  </div>
</template>
