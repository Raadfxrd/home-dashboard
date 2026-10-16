<script setup>
import {computed} from 'vue';
import AppIcon from '../AppIcon.vue';
import DetailRows from './DetailRows.vue';
import OutfitList from './OutfitList.vue';
import {useWeatherStore} from '../../stores/useWeatherStore.js';
import {clock, planFor} from '../../composables/dayPlan.js';

/* A calendar event, and the weather and clothing for it when it's somewhere
   you go. */
const props = defineProps({
  data: {type: Object, required: true},
});

const weather = useWeatherStore();
const e = computed(() => props.data);

const dateFmt = new Intl.DateTimeFormat('en-GB', {weekday: 'long', day: 'numeric', month: 'long'});
const when = computed(() => {
  const s = new Date(e.value.start);
  return e.value.allDay ? `${dateFmt.format(s)}, all day` : `${dateFmt.format(s)}, ${clock(e.value.start)}–${clock(e.value.end)}`;
});

const plan = computed(() => {
  if (!e.value.out) return null;
  return planFor(
    {start: Date.parse(e.value.start) - 30 * 60000, end: Date.parse(e.value.end), event: e.value},
    {here: weather.amsterdamWeather, outlook: weather.outlook}
  );
});

const weatherRows = computed(() => {
  const w = plan.value?.outfit?.weather;
  if (!w) return [];
  const feels = w.feelsMin === w.feelsMax ? `${w.feelsMin}°` : `${w.feelsMin}° to ${w.feelsMax}°`;
  return [
    {label: 'Feels like', value: feels},
    {label: 'Rain', value: w.chanceMax || w.mmMax ? `up to ${w.chanceMax}% chance${w.mmMax >= 0.1 ? `, ${w.mmMax.toFixed(1)} mm/h` : ''}` : 'Dry', tone: w.chanceMax >= 30 ? 'text-accent' : 'text-ink'},
    {label: 'Wind', value: w.windMax != null ? `up to ${w.windMax} km/h` : null},
  ];
});

const day = computed(() => new Intl.DateTimeFormat('en-GB', {weekday: 'long'}).format(new Date(e.value.start)));

const mapsUrl = computed(() => (e.value.location ? `https://maps.apple.com/?q=${encodeURIComponent(e.value.location)}` : null));
</script>

<template>
  <article class="p-6">
    <p class="t-note">{{ when }}</p>
    <h2 class="mt-1 pr-8 text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] text-ink">{{ e.title }}</h2>

    <DetailRows class="mt-4" :rows="e.kind === 'birthday'
      ? [{label: 'Turns', value: e.age}, {label: 'From', value: 'Your contacts'}]
      : [{label: 'Calendar', value: e.calendar}]"/>

    <a v-if="mapsUrl" :href="mapsUrl" target="_blank" rel="noopener noreferrer" class="press mt-3 flex items-start gap-2.5 rounded-md bg-line-soft/60 p-3 text-[0.875rem] text-ink hover:bg-line-soft">
      <AppIcon :size="17" class="mt-0.5 shrink-0 text-dim" name="pin"/>
      <span class="min-w-0 flex-1 break-words">{{ e.location }}</span>
      <AppIcon :size="14" class="mt-1 shrink-0 text-faint" name="external"/>
    </a>

    <template v-if="plan">
      <h3 class="mb-1 mt-6 text-[0.8125rem] font-semibold text-dim">Weather while you're out</h3>
      <DetailRows :rows="weatherRows"/>
      <h3 class="mb-3 mt-5 text-[0.8125rem] font-semibold text-dim">What to wear</h3>
      <OutfitList :outfit="plan.outfit"/>
    </template>
    <p v-else-if="e.out" class="mt-6 t-note">Weather and what to wear show up here once {{ day }} is within the 5-day forecast.</p>
  </article>
</template>
