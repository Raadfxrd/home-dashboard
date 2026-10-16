<script setup>
import {computed} from 'vue';
import AppIcon from '../AppIcon.vue';
import DetailRows from './DetailRows.vue';
import OutfitList from './OutfitList.vue';
import {outfitFor} from '../../composables/outfit.js';

/* One 3-hour forecast block: the full reading and what to wear for it. */
const props = defineProps({
  data: {type: Object, required: true}, // {block, next, glyph}
});

const b = computed(() => props.data.block || {});
const span = computed(() => (props.data.next ? `${b.value.time}–${props.data.next}` : `From ${b.value.time}`));
const outfit = computed(() => outfitFor([b.value]));

const rows = computed(() => {
  const x = b.value;
  const rain = x.rainChance != null
    ? `${x.rainChance}% chance${x.mm >= 0.1 ? `, about ${x.mm.toFixed(1)} mm/h` : ''}`
    : null;
  const wind = x.windSpeed != null
    ? `${x.windSpeed} km/h${x.windDirection ? ` ${x.windDirection}` : ''}${x.windGust ? `, gusts ${x.windGust}` : ''}`
    : null;
  return [
    {label: 'Feels like', value: x.feelsLike != null ? `${x.feelsLike}°` : null},
    {label: 'Rain', value: rain, tone: x.rainChance >= 30 ? 'text-accent' : 'text-ink'},
    {label: 'Wind', value: wind, tone: (x.windGust || x.windSpeed) >= 40 ? 'text-warn' : 'text-ink'},
    {label: 'Humidity', value: x.humidity != null ? `${x.humidity}%` : null},
    {label: 'Cloud cover', value: x.clouds != null ? `${x.clouds}%` : null},
    {label: 'Visibility', value: x.visibilityKm != null ? `${x.visibilityKm} km` : null},
  ];
});
</script>

<template>
  <article class="p-6">
    <p class="t-note">{{ span }}</p>
    <div class="mt-2 flex items-center gap-4">
      <span class="text-[3rem] font-semibold leading-none tracking-[-0.04em] text-ink">{{ b.temperature }}°</span>
      <span class="flex items-center gap-2 text-[1.125rem] text-ink first-letter:uppercase">
        <AppIcon :size="22" class="text-dim" :name="data.glyph || 'cloud'"/>
        <span class="first-letter:uppercase">{{ b.condition }}</span>
      </span>
    </div>

    <DetailRows class="mt-5" :rows="rows"/>

    <h3 class="mb-3 mt-6 text-[0.8125rem] font-semibold text-dim">What to wear</h3>
    <OutfitList :outfit="outfit"/>
  </article>
</template>
