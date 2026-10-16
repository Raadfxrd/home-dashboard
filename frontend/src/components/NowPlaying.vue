<script setup>
/**
 * What's playing on Jellyfin right now: one card per stream with the
 * poster, who and where, progress, and how it reaches the screen. The
 * network tag makes a stream that goes through Tailscale instead of the
 * local network obvious at a glance.
 */
import {useDetailStore} from '../stores/useDetailStore.js';

const detail = useDetailStore();

defineProps({
  sessions: {type: Array, default: () => []},
  // In the top band: a small label and one column of cards.
  compact: {type: Boolean, default: false},
});

function clock(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}` : `${m} min`;
}

function remaining(s) {
  if (!s.runtimeSeconds) return '';
  const left = Math.max(0, s.runtimeSeconds - s.positionSeconds);
  return `${clock(left)} left`;
}

const NETWORK = {
  local: {text: 'Local', tone: 'text-dim'},
  tailscale: {text: 'Via Tailscale', tone: 'text-warn'},
  remote: {text: 'Remote', tone: 'text-dim'},
};

function method(s) {
  if (s.playMethod === 'Transcode') return 'Transcoding';
  if (s.playMethod === 'DirectStream') return 'Direct stream';
  if (s.playMethod === 'DirectPlay') return 'Direct play';
  return '';
}
</script>

<template>
  <section class="settle" :class="compact ? 'max-w-[36rem]' : ''">
    <header class="flex items-baseline justify-between gap-4" :class="compact ? 'mb-2.5' : 'mb-4'">
      <h2 :class="compact ? 'text-[0.8125rem] font-semibold text-dim' : 't-section'">Now playing</h2>
      <p class="t-note">{{ sessions.length === 1 ? '1 stream' : `${sessions.length} streams` }}</p>
    </header>

    <TransitionGroup
        name="np"
        tag="div"
        class="grid grid-cols-1 gap-3"
        :class="compact ? '' : 'md:grid-cols-2 2xl:grid-cols-3'"
    >
      <button
          v-for="s in sessions"
          :key="s.id"
          type="button"
          class="np-card panel press group flex gap-4 p-3 text-left"
          @click="detail.open('stream', s, $event)"
      >
        <span class="well relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-[8px]">
          <img v-if="s.poster" :src="s.poster" :alt="s.title" class="h-full w-full object-cover" loading="lazy"/>
        </span>
        <span class="flex min-w-0 flex-1 flex-col justify-between gap-2 py-0.5">
          <span class="min-w-0">
            <span class="flex items-center gap-2">
              <span class="truncate text-[0.9375rem] font-semibold text-ink">{{ s.title }}</span>
              <span v-if="s.paused" class="shrink-0 rounded-[5px] bg-line-soft px-1.5 py-px text-[0.6875rem] text-dim">Paused</span>
            </span>
            <span v-if="s.subtitle" class="block truncate t-note">{{ s.subtitle }}</span>
          </span>
          <span class="flex flex-col gap-1.5">
            <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.75rem] text-dim">
              <span>{{ [s.user, s.device].filter(Boolean).join(' on ') }}</span>
              <span v-if="NETWORK[s.network]" :class="NETWORK[s.network].tone" :title="s.ip">{{ NETWORK[s.network].text }}</span>
              <span v-if="method(s)" class="text-faint">{{ method(s) }}</span>
            </span>
            <span class="flex items-center gap-2.5">
              <span class="well block h-1 flex-1 overflow-hidden rounded-full">
                <span
                    class="block h-full rounded-full transition-[width] duration-700 ease-ease"
                    :class="s.paused ? 'bg-dim' : 'bg-ink'"
                    :style="{width: `${s.progress}%`}"
                ></span>
              </span>
              <span class="shrink-0 text-[0.6875rem] tabular-nums text-faint">{{ remaining(s) }}</span>
            </span>
          </span>
        </span>
      </button>
    </TransitionGroup>
  </section>
</template>

<style scoped>
.np-card {
  background: rgb(var(--raised-rgb) / 0.82);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

@media (prefers-reduced-transparency: reduce) {
  .np-card {
    background: rgb(var(--raised-rgb));
    backdrop-filter: none;
  }
}

.np-enter-active,
.np-leave-active {
  transition: opacity 300ms var(--ease), transform 300ms var(--ease);
}

.np-enter-from,
.np-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.np-move {
  transition: transform 300ms var(--ease);
}
</style>
