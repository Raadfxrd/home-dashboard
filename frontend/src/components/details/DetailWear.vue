<script setup>
import {computed} from 'vue';
import DetailRows from './DetailRows.vue';
import OutfitList from './OutfitList.vue';
import {clock} from '../../composables/dayPlan.js';

/* The what-to-wear advice, with the weather it's based on. */
const props = defineProps({
  data: {type: Object, required: true}, // a plan from dayPlan.planFor
});

const p = computed(() => props.data);
const w = computed(() => props.data.outfit?.weather || {});
const span = computed(() => `${clock(p.value.start)}–${clock(p.value.end)}`);

const rows = computed(() => [
  {label: 'Feels like', value: w.value.feelsMin == null ? null : w.value.feelsMin === w.value.feelsMax ? `${w.value.feelsMin}°` : `${w.value.feelsMin}° to ${w.value.feelsMax}°`},
  {label: 'Rain', value: w.value.chanceMax || w.value.mmMax ? `up to ${w.value.chanceMax}% chance${w.value.mmMax >= 0.1 ? `, ${w.value.mmMax.toFixed(1)} mm/h` : ''}` : 'Dry', tone: w.value.chanceMax >= 30 ? 'text-accent' : 'text-ink'},
  {label: 'Wind', value: w.value.windMax != null ? `up to ${w.value.windMax} km/h` : null, tone: w.value.windMax >= 40 ? 'text-warn' : 'text-ink'},
  {label: 'Snow', value: w.value.snow ? 'Expected' : null},
]);

const basis = computed(() => {
  const kinds = new Set(p.value.samples.map((s) => s.source));
  const parts = [kinds.has('now') && 'the current weather', kinds.has('radar') && 'the rain radar', kinds.has('forecast') && 'the forecast'].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] || '';
});
</script>

<template>
  <article class="p-6">
    <p class="t-note">{{ p.label }} · {{ span }}</p>
    <h2 class="mt-1 pr-8 text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] text-ink">{{ p.outfit.headline }}</h2>

    <OutfitList class="mt-5" :outfit="p.outfit"/>

    <h3 class="mb-1 mt-6 text-[0.8125rem] font-semibold text-dim">Based on</h3>
    <DetailRows :rows="rows"/>
    <p v-if="basis" class="mt-3 t-note text-[0.75rem]">Based on {{ basis }}, dressed for the coldest and wettest moment in this window.</p>
  </article>
</template>
