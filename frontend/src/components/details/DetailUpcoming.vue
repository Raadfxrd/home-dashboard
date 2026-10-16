<script setup>
import {computed} from 'vue';
import AppIcon from '../AppIcon.vue';
import DetailRows from './DetailRows.vue';

/* An episode or film from Coming up, with what Sonarr/Radarr know about it. */
const props = defineProps({
  data: {type: Object, required: true},
});

const x = computed(() => props.data);
const d = computed(() => props.data.details || {});

const dateFmt = new Intl.DateTimeFormat('en-GB', {weekday: 'long', day: 'numeric', month: 'long'});
const timeFmt = new Intl.DateTimeFormat('nl-NL', {hour: '2-digit', minute: '2-digit'});
const when = computed(() => {
  const at = new Date(x.value.at);
  return x.value.allDay ? dateFmt.format(at) : `${dateFmt.format(at)}, ${timeFmt.format(at)}`;
});

const rows = computed(() => [
  {label: x.value.kind === 'movie' ? 'Studio' : 'Network', value: d.value.network || d.value.studio},
  {label: 'Runtime', value: d.value.runtimeMin ? `${d.value.runtimeMin} min` : null},
  {label: 'Genres', value: d.value.genres?.slice(0, 3).join(', ')},
  {label: 'Rated', value: d.value.certification},
  {label: 'Downloaded', value: x.value.hasFile ? 'Yes, ready to watch' : 'Not yet', tone: x.value.hasFile ? 'text-live' : 'text-dim'},
]);

const releases = computed(() =>
  (d.value.releases || []).map((r) => ({label: r.label, value: dateFmt.format(new Date(r.at))}))
);
</script>

<template>
  <article class="p-6">
    <div class="flex gap-5">
      <span class="well aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-[10px]">
        <img v-if="x.poster" :src="x.poster" :alt="x.title" class="h-full w-full object-cover"/>
      </span>
      <div class="min-w-0 pr-8">
        <p class="t-note">{{ when }}</p>
        <h2 class="mt-1 text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] text-ink">{{ x.title }}</h2>
        <p v-if="x.subtitle" class="mt-1 text-[0.875rem] text-dim">{{ x.subtitle }}</p>
      </div>
    </div>

    <template v-if="d.overview">
      <h3 v-if="d.overviewIsSeries" class="mt-5 text-[0.75rem] font-semibold text-faint">About the series</h3>
      <p class="text-[0.875rem] leading-relaxed text-dim" :class="d.overviewIsSeries ? 'mt-1' : 'mt-5'">{{ d.overview }}</p>
    </template>

    <DetailRows class="mt-4" :rows="rows"/>

    <template v-if="releases.length">
      <h3 class="mb-1 mt-5 text-[0.8125rem] font-semibold text-dim">Release dates</h3>
      <DetailRows :rows="releases"/>
    </template>

    <a v-if="d.link" :href="d.link" target="_blank" rel="noopener noreferrer" class="press mt-6 inline-flex items-center gap-2 rounded-full bg-line-soft px-4 py-2.5 text-[0.875rem] text-ink hover:bg-line">
      Open in {{ d.app }} <AppIcon :size="15" name="external"/>
    </a>
  </article>
</template>
