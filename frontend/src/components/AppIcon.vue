<script setup>
import {computed} from 'vue';

const props = defineProps({
  name: {type: String, required: true},
  size: {type: Number, default: 20},
  strokeWidth: {type: Number, default: 1.9},
});

const viewBox = '0 0 24 24';

const paths = {
  home: ['M3 10.5 12 3l9 7.5', 'M5.5 8.6V20h13V8.6', 'M9.6 20v-5.5h4.8V20'],
  location: ['m12 21 6.3-8.1a7 7 0 1 0-12.6 0L12 21z', 'M12 12.1a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2'],
  clock: ['M12 6.5v5.3l3.5 2.1', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  lightbulb: ['M9 18h6', 'M9.8 21h4.4', 'M8 10.2a4 4 0 1 1 8 0c0 1.6-.8 2.7-1.8 3.8-.7.8-1.2 1.5-1.2 2.5h-2c0-1-.5-1.7-1.2-2.5-1-1.1-1.8-2.2-1.8-3.8Z'],
  power: ['M12 3.6v6.8', 'M7.8 6.8a7 7 0 1 0 8.4 0'],
  fan: ['M12 12v.1', 'M12.5 7.8c0 2-1.2 3.3-2.7 3.3-1.4 0-2.6-1.1-2.6-2.7A2.7 2.7 0 0 1 12.5 7.8Z', 'M15.9 13.2c-1.8.9-3.6.6-4.4-.6-.8-1.2-.4-2.8.9-3.6a2.7 2.7 0 0 1 3.5 4.2Z', 'M10.8 15.8c-.1-2 1.1-3.4 2.5-3.4 1.5 0 2.7 1 2.8 2.5a2.7 2.7 0 0 1-5.3.9Z', 'M8.1 10.9c1.9-.9 3.6-.5 4.4.7.8 1.3.4 2.8-.9 3.6a2.7 2.7 0 0 1-3.5-4.3Z'],
  thermostat: ['M14.5 14.8a2.5 2.5 0 1 1-5 0c0-1 .6-1.8 1.4-2.2V6.3a1.1 1.1 0 1 1 2.2 0v6.3c.8.4 1.4 1.2 1.4 2.2Z', 'M12 17.4v.1', 'M12 4.2v2.1'],
  lock: ['M7.5 11.2h9v8h-9z', 'M9 11.2V8.9a3 3 0 0 1 6 0v2.3'],
  sensor: ['M12 12h.01', 'M8.5 12a3.5 3.5 0 1 1 7 0', 'M6 12a6 6 0 1 1 12 0', 'M3.5 12a8.5 8.5 0 1 1 17 0'],
  droplet: ['M12 3.5s5 5.5 5 9.2a5 5 0 1 1-10 0c0-3.7 5-9.2 5-9.2Z'],
  wind: ['M4 9.5h9.6a2.4 2.4 0 1 0-2.4-2.4', 'M3 13h14a2.5 2.5 0 1 1-2.5 2.5', 'M4 16.5h8'],
  cloudOff: ['m4 4 16 16', 'M8.6 18.3a4.2 4.2 0 1 1 .2-8.4 5.4 5.4 0 0 1 9 2.6 3.4 3.4 0 0 1-3.4 5.8Z'],
  film: ['M4 6.2h16v11.6H4z', 'M8 6.2v11.6', 'M16 6.2v11.6', 'M4 10h4', 'M16 10h4', 'M4 14h4', 'M16 14h4'],
};

const iconPaths = computed(() => paths[props.name] || paths.home);
</script>

<template>
  <svg
      :height="size"
      :stroke-width="strokeWidth"
      :viewBox="viewBox"
      :width="size"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      xmlns="http://www.w3.org/2000/svg"
  >
    <path v-for="path in iconPaths" :key="path" :d="path"/>
  </svg>
</template>

