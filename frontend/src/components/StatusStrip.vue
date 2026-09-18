<script setup>
import {computed} from 'vue';

/**
 * One line telling you whether the services behind the dashboard are up.
 * It sits at the foot of the page rather than floating over the content,
 * because it is reference, not an alert.
 */
const props = defineProps({
  status: {type: Object, required: true},
});

const TONE = {
  live: 'dot dot-live',
  warn: 'dot dot-warn',
  fault: 'dot dot-fault',
  off: 'dot dot-off',
};

function state(summary) {
  if (!summary?.configured) return {tone: 'off', text: 'not configured'};
  const total = summary.total ?? 0;
  const online = summary.onlineCount ?? 0;
  if (total && online === total) return {tone: 'live', text: `${online}/${total}`};
  if (online > 0) return {tone: 'warn', text: `${online}/${total}`};
  return {tone: 'fault', text: `0/${total}`};
}

const rows = computed(() => [
  {label: 'Indexers', ...state(props.status.indexers)},
  {label: 'Download clients', ...state(props.status.downloadClients)},
  {
    label: 'NAS',
    ...(props.status.nasMetrics?.configured
        ? props.status.nasMetrics.online
            ? {tone: 'live', text: 'online'}
            : {tone: 'fault', text: props.status.nasMetrics.error || 'offline'}
        : {tone: 'off', text: 'not configured'}),
  },
]);
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-7 gap-y-2">
    <span v-for="row in rows" :key="row.label" class="flex items-center gap-2.5 t-note">
      <span :class="TONE[row.tone]"></span>
      <span>{{ row.label }}</span>
      <span class="t-read text-dim">{{ row.text }}</span>
    </span>
  </div>
</template>
