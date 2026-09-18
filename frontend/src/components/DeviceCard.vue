<script setup>
import {computed, onUnmounted, ref} from 'vue';
import {useHomeStore} from '../stores/useHomeStore.js';
import AppIcon from './AppIcon.vue';

/**
 * A device tile. For a dimmable light the whole tile is the slider: it fills
 * from the bottom with that light's own colour, so the control looks like
 * what it does. Drag up for brighter, exactly as far as you drag.
 *
 * Every tile puts its controls in the top row and its label in the bottom,
 * so a grid of them lines up whatever each device happens to support.
 */
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

const cardRef = ref(null);
const isDragging = ref(false);
const preview = ref(null);
const activePointer = ref(null);
const wheelTimer = ref(null);
const wheelVersion = ref(0);

const isOn = computed(() => {
  const value = props.device.state;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const n = value.trim().toLowerCase();
    return n === 'true' || n === '1' || n === 'on' || n === 'yes';
  }
  return Boolean(value);
});

const canDim = computed(() => props.device.type === 'light' && props.device.supportsBrightness);
const canAdjust = computed(() => canDim.value && isOn.value);

const brightness = computed(() => {
  if (typeof preview.value === 'number') return preview.value;
  if (typeof props.device.brightness === 'number') {
    return Math.max(0, Math.min(100, props.device.brightness));
  }
  return isOn.value ? 100 : 0;
});

const accent = computed(() => props.device.color || '#ffcf94');

function rgba(hex, alpha) {
  if (typeof hex !== 'string') return `rgba(255, 207, 148, ${alpha})`;
  const n = hex.startsWith('#') ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(n)) return `rgba(255, 207, 148, ${alpha})`;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* The light pools at the bottom and fades out at the top. A hard edge would
   draw a line across whatever text it happened to cross. */
const fillStyle = computed(() => {
  if (!canDim.value) return {height: '0%', opacity: 0};
  const pct = isOn.value || isDragging.value ? brightness.value : 0;
  return {
    height: `${Math.min(100, pct + 14)}%`,
    background: `linear-gradient(to top,
      ${rgba(accent.value, 0.42)} 0%,
      ${rgba(accent.value, 0.34)} ${Math.max(0, pct - 6)}%,
      ${rgba(accent.value, 0)} 100%)`,
    opacity: pct > 0 ? 1 : 0,
    transition: isDragging.value ? 'none' : 'height 380ms var(--ease), opacity 260ms var(--ease)',
  };
});

/* Resist past the ends instead of stopping dead, so the limit is felt
   rather than hit. */
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

function pointerToBrightness(event) {
  const el = cardRef.value;
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const y = event.clientY - rect.top;
  const raw = 100 - (y / rect.height) * 100;

  if (raw > 100) return 100 + rubberband(raw - 100, 100) * 0.12;
  if (raw < 0) return rubberband(raw, 100) * 0.12;
  return raw;
}

function onPointerDown(event) {
  if (!canAdjust.value || event.button !== 0) return;
  if (event.target.closest('[data-no-drag]')) return;

  clearWheelTimer();
  isDragging.value = true;
  activePointer.value = event.pointerId;
  cardRef.value?.setPointerCapture?.(event.pointerId);
  preview.value = pointerToBrightness(event);
}

function onPointerMove(event) {
  if (!isDragging.value || event.pointerId !== activePointer.value) return;
  preview.value = pointerToBrightness(event);
}

async function onPointerUp(event) {
  if (!isDragging.value || event.pointerId !== activePointer.value) return;

  const final = Math.max(0, Math.min(100, Math.round(preview.value ?? brightness.value)));
  isDragging.value = false;
  activePointer.value = null;
  cardRef.value?.releasePointerCapture?.(event.pointerId);
  preview.value = final;

  await homeStore.setBrightness(props.device.id, final);
  preview.value = null;
}

function clearWheelTimer() {
  if (!wheelTimer.value) return;
  clearTimeout(wheelTimer.value);
  wheelTimer.value = null;
  wheelVersion.value += 1;
}

function commitAfterIdle(value, delay) {
  clearWheelTimer();
  const version = wheelVersion.value;
  wheelTimer.value = setTimeout(async () => {
    if (version !== wheelVersion.value) return;
    await homeStore.setBrightness(props.device.id, value);
    if (version !== wheelVersion.value) return;
    preview.value = null;
    wheelTimer.value = null;
  }, delay);
}

function onWheel(event) {
  if (!canAdjust.value) return;
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('[data-no-drag]')) return;

  event.preventDefault();
  const direction = event.deltaY > 0 ? -1 : 1;
  const step = event.shiftKey ? 10 : 4;
  const next = Math.max(0, Math.min(100, Math.round(brightness.value + direction * step)));
  if (next === brightness.value) return;

  preview.value = next;
  commitAfterIdle(next, 140);
}

function onKeydown(event) {
  if (!canAdjust.value) return;
  const step = event.shiftKey ? 10 : 2;
  let next = null;
  if (event.key === 'ArrowUp') next = Math.min(100, brightness.value + step);
  if (event.key === 'ArrowDown') next = Math.max(0, brightness.value - step);
  if (next === null) return;
  event.preventDefault();
  next = Math.round(next);
  preview.value = next;
  commitAfterIdle(next, 260);
}

/* Words stay in the text face; only readings are set in mono. "On" in a
   monospace face reads as a zero. */
const readout = computed(() => {
  if (props.device.value) return {text: props.device.value, numeric: true};
  if (!props.device.canToggle) return {text: isOn.value ? 'Active' : 'Idle', numeric: false};
  if (!isOn.value) return {text: 'Off', numeric: false};
  if (canDim.value) {
    return {text: `${Math.round(Math.max(0, Math.min(100, brightness.value)))}%`, numeric: true};
  }
  return {text: 'On', numeric: false};
});

onUnmounted(() => clearWheelTimer());
</script>

<template>
  <div
      ref="cardRef"
      :class="[
        canAdjust ? 'cursor-ns-resize select-none touch-none' : '',
        isOn ? 'border-line' : 'border-line-soft',
      ]"
      :style="!canDim && isOn ? {background: 'color-mix(in srgb, var(--raised) 86%, var(--text) 14%)'} : undefined"
      class="panel press relative overflow-hidden"
      :tabindex="canAdjust ? 0 : -1"
      :role="canAdjust ? 'slider' : undefined"
      :aria-label="canAdjust ? `${device.name} brightness` : undefined"
      :aria-valuenow="canAdjust ? Math.round(brightness) : undefined"
      aria-valuemin="0"
      aria-valuemax="100"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
  >
    <div class="pointer-events-none absolute inset-x-0 bottom-0" :style="fillStyle" aria-hidden="true"/>

    <!-- Holds the label legible however bright the light behind it is. -->
    <div
        v-if="canDim"
        class="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent"
        aria-hidden="true"
    />

    <div class="relative z-10 flex h-full flex-col justify-between gap-5 p-3.5">
      <!-- Controls, always in the same place on every tile. -->
      <div class="flex items-center justify-between gap-2">
        <span class="flex items-center gap-2.5">
          <span :class="isOn ? 'text-ink' : 'text-faint'" class="transition-colors duration-200">
            <AppIcon :name="icons[device.type] || 'home'" :size="19"/>
          </span>

          <label v-if="device.type === 'light' && device.supportsColor" data-no-drag @pointerdown.stop>
            <span class="sr-only">{{ device.name }} colour</span>
            <input
                :value="device.color || '#ffffff'"
                class="h-[18px] w-[18px] cursor-pointer rounded-full border border-line bg-transparent p-0 align-middle"
                type="color"
                @click.stop
                @input="homeStore.setColor(props.device.id, $event.target.value)"
            />
          </label>
        </span>

        <button
            v-if="device.canToggle"
            data-no-drag
            type="button"
            role="switch"
            :aria-checked="isOn"
            :aria-label="`Turn ${device.name} ${isOn ? 'off' : 'on'}`"
            :class="isOn ? 'bg-ink/90' : 'bg-sunk border border-line'"
            class="relative h-[22px] w-[38px] flex-none rounded-full transition-colors duration-300 ease-ease"
            @click.stop="homeStore.toggleDevice(props.device.id, !isOn)"
            @pointerdown.stop
        >
          <span
              :class="isOn
                ? 'translate-x-[17px] bg-base'
                : 'translate-x-0 bg-faint'"
              class="absolute left-[2.5px] top-[2.5px] h-4 w-4 rounded-full transition-all duration-300 ease-ease"
          ></span>
        </button>
      </div>

      <!-- Label, always at the foot. -->
      <div class="min-w-0">
        <p class="truncate text-[0.875rem] font-medium leading-tight text-ink">{{ device.name }}</p>
        <p class="mt-1 flex items-baseline gap-2 truncate text-[0.8125rem]">
          <span
              :class="[isOn ? 'text-ink' : 'text-dim', readout.numeric ? 't-read' : '']"
              class="shrink-0"
          >{{ readout.text }}</span>
          <span v-if="device.room" class="truncate text-faint">{{ device.room }}</span>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
input[type='color'] {
  -webkit-appearance: none;
  appearance: none;
}

input[type='color']::-webkit-color-swatch-wrapper {
  padding: 0;
}

input[type='color']::-webkit-color-swatch {
  border: none;
  border-radius: 999px;
}
</style>
