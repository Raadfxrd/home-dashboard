<script setup>
import {computed, onMounted, ref} from 'vue';
import AppIcon from '../AppIcon.vue';
import DetailRows from './DetailRows.vue';
import {get} from '../../composables/useApi.js';

/* A film or show from the library: loads its full details from Jellyfin,
   showing what the card already knew while that happens. */
const props = defineProps({
  data: {type: Object, required: true}, // a media card item
});

const info = ref(null);
const error = ref(null);

onMounted(async () => {
  try {
    info.value = await get(`/jellyfin/item/${encodeURIComponent(props.data.id)}`);
  } catch (err) {
    error.value = err.response?.data?.error || 'Couldn\'t load the details.';
  }
});

const m = computed(() => ({...props.data, ...(info.value || {})}));

const facts = computed(() => {
  const x = m.value;
  const years = x.endYear && x.endYear !== x.year ? `${x.year}–${x.endYear}` : x.year;
  return [years, x.runtimeMin && `${x.runtimeMin} min`, x.seasons && `${x.seasons} season${x.seasons === 1 ? '' : 's'}`, x.certification]
    .filter(Boolean)
    .join(' · ');
});

const rows = computed(() => [
  {label: 'Rating', value: m.value.rating ? `★ ${m.value.rating}` : null},
  {label: 'Status', value: m.value.status === 'Continuing' ? 'Still running' : m.value.status === 'Ended' ? 'Ended' : null},
  {label: 'Director', value: m.value.directors?.join(', ')},
  {label: 'Studio', value: m.value.studios?.join(', ')},
  {label: 'Watched', value: m.value.played ? 'Yes' : m.value.progress ? `${m.value.progress}% in` : null},
]);
</script>

<template>
  <article class="p-6">
    <div class="flex gap-5">
      <span class="well aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-[10px]">
        <img v-if="m.poster" :src="m.poster" :alt="m.title" class="h-full w-full object-cover"/>
      </span>
      <div class="min-w-0 pr-8">
        <h2 class="text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] text-ink">{{ m.title }}</h2>
        <p v-if="facts" class="mt-1 t-note">{{ facts }}</p>
        <p v-if="m.genres?.length" class="mt-2 text-[0.8125rem] text-dim">{{ m.genres.slice(0, 4).join(', ') }}</p>
        <p v-if="m.tagline" class="mt-3 text-[0.875rem] italic text-dim">{{ m.tagline }}</p>
      </div>
    </div>

    <div v-if="!info && !error" class="mt-5 flex flex-col gap-2" aria-busy="true" aria-label="Loading details">
      <span class="skeleton h-3 w-full"></span>
      <span class="skeleton h-3 w-11/12"></span>
      <span class="skeleton h-3 w-3/5"></span>
    </div>
    <p v-else-if="error" class="mt-5 flex items-center gap-2 t-note"><span class="dot dot-warn"></span>{{ error }}</p>

    <div v-else class="reveal">
      <p v-if="m.overview" class="mt-5 text-[0.875rem] leading-relaxed text-dim">{{ m.overview }}</p>
      <DetailRows class="mt-4" :rows="rows"/>
      <p v-if="m.cast?.length" class="mt-4 text-[0.8125rem] text-dim"><span class="t-note">With </span>{{ m.cast.join(', ') }}</p>
    </div>

    <a v-if="m.url" :href="m.url" target="_blank" rel="noopener noreferrer" class="press mt-6 inline-flex items-center gap-2 rounded-full bg-line-soft px-4 py-2.5 text-[0.875rem] text-ink hover:bg-line">
      {{ m.progress && !m.played ? 'Continue in Jellyfin' : 'Open in Jellyfin' }} <AppIcon :size="15" name="external"/>
    </a>
  </article>
</template>
