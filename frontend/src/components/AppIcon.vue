<script setup>
import {computed} from 'vue';

const props = defineProps({
  name: {type: String, required: true},
  size: {type: Number, default: 20},
  strokeWidth: {type: Number, default: 1.75},
});

/* Drawn on a 24px grid at a single stroke weight so the set reads as one
   family. Rounded joins, open counters — domestic rather than technical. */
const paths = {
  home: ['M3 10.5 12 3l9 7.5', 'M5.5 8.6V20h13V8.6', 'M9.6 20v-5.5h4.8V20'],
  clock: ['M12 6.5v5.3l3.5 2.1', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  cloud: ['M7 18.5a4.5 4.5 0 1 1 1-8.9 6 6 0 0 1 11.3 2.6A3.3 3.3 0 0 1 18 18.5Z'],
  cloudSun: ['M8 4.2v1.3', 'M3.6 8.6h1.3', 'M4.9 5.5l.9.9', 'M11.2 5.5l-.9.9', 'M5.3 11.2A3.2 3.2 0 1 1 10.6 7.6', 'M8.5 19.5a3.8 3.8 0 1 1 .9-7.5 5 5 0 0 1 9.4 2.2 2.7 2.7 0 0 1-1 5.3Z'],
  cloudMoon: ['M10.4 4.3a4 4 0 0 0 4.4 5.2 4 4 0 0 1-8.1 1', 'M8.5 19.5a3.8 3.8 0 1 1 .9-7.5 5 5 0 0 1 9.4 2.2 2.7 2.7 0 0 1-1 5.3Z'],
  rain: ['M7 15a4.2 4.2 0 1 1 1-8.3 5.6 5.6 0 0 1 10.5 2.4A3 3 0 0 1 17.6 15Z', 'M9 18l-1 2.2', 'M13 18l-1 2.2', 'M17 18l-1 2.2'],
  snow: ['M7 14.5a4.2 4.2 0 1 1 1-8.3 5.6 5.6 0 0 1 10.5 2.4A3 3 0 0 1 17.6 14.5Z', 'M8.5 18.2h.01', 'M12 19.6h.01', 'M15.5 18.2h.01', 'M10.2 21.2h.01', 'M13.8 21.2h.01'],
  fog: ['M4 9.5h16', 'M6 13h12', 'M4 16.5h16', 'M8 20h8'],
  storm: ['M7 14.5a4.2 4.2 0 1 1 1-8.3 5.6 5.6 0 0 1 10.5 2.4A3 3 0 0 1 17.6 14.5Z', 'm12.6 13.5-2.2 3.6h3l-2.2 3.6'],
  sunrise: ['M12 3v5', 'm9.5 5.5 2.5-2.5 2.5 2.5', 'M4 19h16', 'M7.5 15.5a4.5 4.5 0 0 1 9 0', 'M4.6 12.4l1.3.8', 'M19.4 12.4l-1.3.8'],
  sunset: ['M12 8V3', 'm9.5 5.5 2.5 2.5 2.5-2.5', 'M4 19h16', 'M7.5 15.5a4.5 4.5 0 0 1 9 0', 'M4.6 12.4l1.3.8', 'M19.4 12.4l-1.3.8'],
  droplet: ['M12 3.5s5 5.5 5 9.2a5 5 0 1 1-10 0c0-3.7 5-9.2 5-9.2Z'],
  wind: ['M4 9.5h9.6a2.4 2.4 0 1 0-2.4-2.4', 'M3 13h14a2.5 2.5 0 1 1-2.5 2.5', 'M4 16.5h8'],
  cloudOff: ['m4 4 16 16', 'M8.6 18.3a4.2 4.2 0 1 1 .2-8.4 5.4 5.4 0 0 1 9 2.6 3.4 3.4 0 0 1-3.4 5.8Z'],
  film: ['M4 6.2h16v11.6H4z', 'M8 6.2v11.6', 'M16 6.2v11.6', 'M4 10h4', 'M16 10h4', 'M4 14h4', 'M16 14h4'],
  cpu: ['M8.5 8.5h7v7h-7z', 'M6 6h12v12H6z', 'M9.5 3v3', 'M14.5 3v3', 'M9.5 18v3', 'M14.5 18v3', 'M3 9.5h3', 'M3 14.5h3', 'M18 9.5h3', 'M18 14.5h3'],
  memory: ['M4 7.5h16v9H4z', 'M8 16.5v2.5', 'M12 16.5v2.5', 'M16 16.5v2.5', 'M8 5v2.5', 'M16 5v2.5'],
  disk: ['M21 7.5c0 1.7-4 3-9 3s-9-1.3-9-3 4-3 9-3 9 1.3 9 3Z', 'M3 7.5v9c0 1.7 4 3 9 3s9-1.3 9-3v-9', 'M21 12c0 1.7-4 3-9 3s-9-1.3-9-3'],
  network: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M3.2 9.5h17.6', 'M3.2 14.5h17.6', 'M12 3c2.4 2.4 3.6 5.4 3.6 9s-1.2 6.6-3.6 9c-2.4-2.4-3.6-5.4-3.6-9S9.6 5.4 12 3Z'],
  download: ['M12 4v10', 'm8 10.5 4 4 4-4', 'M4.5 18.5h15'],
  arrow: ['M5 12h13', 'm12.5 6.5 5.5 5.5-5.5 5.5'],
  back: ['M19 12H6', 'm11.5 6.5-5.5 5.5 5.5 5.5'],
  sun: ['M12 16.8a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6Z', 'M12 2v2.2', 'M12 19.8V22', 'M2 12h2.2', 'M19.8 12H22', 'M4.9 4.9l1.6 1.6', 'M17.5 17.5l1.6 1.6', 'M19.1 4.9l-1.6 1.6', 'M6.5 17.5l-1.6 1.6'],
  moon: ['M20 14.2A8.4 8.4 0 0 1 9.8 4 8.6 8.6 0 1 0 20 14.2Z'],
};

const iconPaths = computed(() => paths[props.name] || paths.home);
</script>

<template>
  <svg
      :height="size"
      :stroke-width="strokeWidth"
      :viewBox="'0 0 24 24'"
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
