<script setup>
import {computed} from 'vue';

/**
 * Downloads, as a dense list rather than nested cards. Each row carries its
 * own progress as a rule along its bottom edge, so a column of rows reads as
 * a small bar chart you can scan vertically. Numbers sit in fixed right-hand
 * columns for the same reason.
 */
const props = defineProps({
  activity: {type: Object, required: true},
});

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  const value = Number(bytes);
  if (!Number.isFinite(value)) return '—';
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let current = value / 1024;
  let i = 0;
  while (current >= 1024 && i < units.length - 1) {
    current /= 1024;
    i += 1;
  }
  return `${current >= 10 ? current.toFixed(0) : current.toFixed(1)} ${units[i]}`;
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value === 0) return 'now';
  const totalMinutes = Math.floor(value / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 24) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${Math.max(1, totalMinutes)}m`;
}

function kind(download) {
  const state = String(download?.state || '').toLowerCase();
  if (state.includes('queued')) return 'queued';
  if (state.includes('stalled')) return 'stalled';
  if (
      state.includes('downloading') || state.includes('forced') ||
      state.includes('check') || state.includes('meta')
  ) return 'running';
  return 'unknown';
}

function eta(download) {
  const k = kind(download);
  if (k === 'stalled') return 'stalled';
  if (k === 'queued') return 'queued';
  return formatDuration(download.etaSeconds);
}

/* Only a stall earns colour. Running and queued are normal, and colouring
   normal states would spend the signal. */
function rule(download) {
  return kind(download) === 'stalled' ? 'var(--warn)' : 'var(--text-dim)';
}

const clients = computed(() => props.activity?.items || []);

const totals = computed(() =>
    clients.value
        .flatMap((c) => c.downloads || [])
        .reduce(
            (acc, d) => {
              const k = kind(d);
              if (k in acc) acc[k] += 1;
              return acc;
            },
            {running: 0, queued: 0, stalled: 0}
        )
);

const summary = computed(() => {
  const t = totals.value;
  const parts = [];
  if (t.running) parts.push(`${t.running} running`);
  if (t.queued) parts.push(`${t.queued} queued`);
  if (t.stalled) parts.push(`${t.stalled} stalled`);
  return parts.join(' · ') || 'Nothing running';
});
</script>

<template>
  <section class="settle">
    <header class="mb-4 flex items-baseline justify-between gap-4">
      <h2 class="t-section">Downloads</h2>
      <p class="t-note t-read">{{ summary }}</p>
    </header>

    <div v-if="clients.length" class="panel divide-y divide-line-soft">
      <div v-for="client in clients" :key="client.id || client.name" class="p-4">
        <div class="mb-3 flex items-center gap-2.5">
          <span :class="client.online ? 'dot dot-live' : 'dot dot-fault'"></span>
          <span class="text-[0.875rem] font-medium text-ink">{{ client.name }}</span>
          <span v-if="!client.online" class="t-note">{{ client.error || 'Offline' }}</span>
          <span class="ml-auto t-note t-read">{{ client.downloads?.length || 0 }}</span>
        </div>

        <ul v-if="client.downloads?.length" class="max-h-[19rem] space-y-px overflow-y-auto pr-1">
          <li
              v-for="download in client.downloads"
              :key="download.id || download.name"
              class="relative py-2.5"
          >
            <div class="flex items-baseline gap-4">
              <span class="min-w-0 flex-1 truncate text-[0.8125rem] text-ink/90" :title="download.name">
                {{ download.name }}
              </span>
              <span class="t-read w-[5.5rem] shrink-0 text-right text-[0.8125rem] text-dim">
                {{ kind(download) === 'running' ? `${formatBytes(download.speedBytesPerSecond)}/s` : '' }}
              </span>
              <span class="t-read w-[4.5rem] shrink-0 text-right text-[0.8125rem] text-faint">
                {{ eta(download) }}
              </span>
              <span class="t-read w-[3.25rem] shrink-0 text-right text-[0.8125rem] text-ink">
                {{ Math.round(download.progress) }}%
              </span>
            </div>

            <!-- The row's own progress, drawn along its bottom edge. -->
            <span class="mt-2 block h-px w-full bg-line-soft" aria-hidden="true">
              <span
                  class="block h-px transition-[width] duration-500 ease-ease"
                  :style="{
                    width: `${Math.max(0, Math.min(100, download.progress || 0))}%`,
                    background: rule(download),
                  }"
              ></span>
            </span>
          </li>
        </ul>

        <p v-else class="t-note">Idle.</p>
      </div>
    </div>

    <p v-else class="panel p-5 t-note">
      No download clients are reporting. Check Prowlarr and your client settings.
    </p>
  </section>
</template>
