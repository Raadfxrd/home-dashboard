<script setup>
import {computed} from 'vue';
import AppIcon from '../AppIcon.vue';
import DetailRows from './DetailRows.vue';

/* A Jellyfin stream in detail: how it reaches the screen and why. */
const props = defineProps({
  data: {type: Object, required: true}, // a now-playing session
});

const s = computed(() => props.data);
const d = computed(() => props.data.details || {});

function clock(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

const playback = computed(() => {
  if (s.value.playMethod === 'Transcode') {
    const parts = [!d.value.videoDirect && 'video', !d.value.audioDirect && 'audio'].filter(Boolean);
    return `Transcoding${parts.length ? ` ${parts.join(' and ')}` : ''}${d.value.hardware ? ` (${d.value.hardware})` : ''}`;
  }
  return s.value.playMethod === 'DirectStream' ? 'Direct stream' : 'Direct play';
});

const network = computed(() => {
  const n = {local: 'Local network', tailscale: 'Via Tailscale', remote: 'From outside'}[s.value.network];
  return n ? `${n}${s.value.ip ? ` · ${s.value.ip}` : ''}` : s.value.ip;
});

const rows = computed(() => [
  {label: 'Watching', value: [s.value.user, s.value.device].filter(Boolean).join(' on ')},
  {label: 'App', value: d.value.app},
  {label: 'Connection', value: network.value, tone: s.value.network === 'tailscale' ? 'text-warn' : 'text-ink'},
  {label: 'Playback', value: playback.value, tone: s.value.playMethod === 'Transcode' ? 'text-warn' : 'text-ink'},
  {label: 'Video', value: d.value.video},
  {label: 'Audio', value: d.value.audio},
  {label: 'Subtitles', value: d.value.subtitles},
  {label: 'Bitrate', value: d.value.bitrateMbps ? `${d.value.bitrateMbps} Mbit/s` : null},
]);
</script>

<template>
  <article>
    <div class="flex gap-5 p-6 pb-4">
      <span class="well aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-[10px]">
        <img v-if="s.poster" :src="s.poster" :alt="s.title" class="h-full w-full object-cover"/>
      </span>
      <div class="min-w-0 pr-8">
        <p class="t-note">{{ s.paused ? 'Paused' : 'Playing' }}</p>
        <h2 class="mt-1 text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] text-ink">{{ s.title }}</h2>
        <p v-if="s.subtitle" class="mt-1 t-note">{{ s.subtitle }}</p>
        <p v-if="d.genres?.length || d.rating" class="mt-2 text-[0.8125rem] text-dim">
          {{ [d.genres?.slice(0, 3).join(', '), d.rating && `★ ${d.rating}`, d.certification].filter(Boolean).join(' · ') }}
        </p>
      </div>
    </div>

    <div class="px-6">
      <span class="well block h-1 overflow-hidden rounded-full">
        <span class="block h-full rounded-full" :class="s.paused ? 'bg-dim' : 'bg-ink'" :style="{width: `${s.progress}%`}"></span>
      </span>
      <p class="mt-1.5 flex justify-between text-[0.75rem] tabular-nums text-faint">
        <span>{{ clock(s.positionSeconds) }}</span>
        <span>{{ clock(s.runtimeSeconds) }}</span>
      </p>
    </div>

    <div class="px-6 pb-6">
      <DetailRows class="mt-3" :rows="rows"/>

      <div v-if="d.transcodeReasons?.length" class="mt-4 rounded-md bg-line-soft/60 p-3">
        <p class="text-[0.8125rem] font-semibold text-warn">Why it's transcoding</p>
        <ul class="mt-1.5 list-disc pl-5 text-[0.8125rem] text-dim">
          <li v-for="r in d.transcodeReasons" :key="r" class="first-letter:uppercase">{{ r }}</li>
        </ul>
      </div>

      <p v-if="d.overview" class="mt-5 text-[0.875rem] leading-relaxed text-dim">{{ d.overview }}</p>

      <a :href="s.url" target="_blank" rel="noopener noreferrer" class="press mt-6 inline-flex items-center gap-2 rounded-full bg-line-soft px-4 py-2.5 text-[0.875rem] text-ink hover:bg-line">
        Open in Jellyfin <AppIcon :size="15" name="external"/>
      </a>
    </div>
  </article>
</template>
