<script setup>
import {computed, onMounted, onUnmounted, ref} from 'vue';

/**
 * One line telling you whether the services behind the dashboard are up.
 * Each entry opens a small panel with the details behind its count: hover
 * on a pointer device, tap on touch. Clicking pins it open; Escape or a
 * click elsewhere closes it.
 */
const props = defineProps({
  status: {type: Object, required: true},
  loading: {type: Boolean, default: false},
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

function itemList(summary, emptyText) {
  if (!summary?.configured) return {items: [], empty: 'Not configured. Add its URL and key to .env.'};
  const items = (summary.items || []).map((item) => ({
    id: item.id ?? item.name,
    name: item.name,
    tone: item.enabled === false ? 'off' : item.online ? 'live' : 'fault',
    note: item.enabled === false ? 'disabled' : item.online ? '' : item.error || 'offline',
  }));
  return {items, empty: items.length ? '' : emptyText};
}

function percent(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : '–';
}

const nas = computed(() => props.status.nasMetrics || {});

const rows = computed(() => [
  {
    key: 'indexers',
    label: 'Indexers',
    title: 'Indexers',
    ...state(props.status.indexers),
    ...itemList(props.status.indexers, 'Prowlarr reports no indexers.'),
  },
  {
    key: 'clients',
    label: 'Download clients',
    title: 'Download clients',
    ...state(props.status.downloadClients),
    ...itemList(props.status.downloadClients, 'No download clients configured.'),
  },
  {
    key: 'nas',
    label: 'NAS',
    title: nas.value.label || 'NAS',
    ...(nas.value.configured
        ? nas.value.online
            ? {tone: 'live', text: 'online'}
            : {tone: 'fault', text: 'offline'}
        : {tone: 'off', text: 'not configured'}),
    items: nas.value.configured && nas.value.online
        ? [
          {id: 'cpu', name: 'Processor', tone: 'live', note: percent(nas.value.cpu?.usagePercent)},
          {id: 'ram', name: 'Memory', tone: 'live', note: percent(nas.value.memory?.usedPercent)},
          {id: 'disk', name: 'Storage', tone: 'live', note: percent(nas.value.disk?.usedPercent)},
        ]
        : [],
    empty: nas.value.configured
        ? nas.value.online ? '' : nas.value.error || 'Not reachable over SNMP.'
        : 'Set NAS_METRICS_MODE=snmp and the SNMP host in .env.',
    source: nas.value.configured && nas.value.source ? `Read over ${String(nas.value.source).toUpperCase()}` : '',
  },
]);

const open = ref(null);
const pinned = ref(false);
const root = ref(null);
let closeTimer = null;
const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

function show(key) {
  clearTimeout(closeTimer);
  open.value = key;
}

function onEnter(key) {
  if (!canHover || pinned.value) return;
  show(key);
}

function onLeave() {
  if (!canHover || pinned.value) return;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    open.value = null;
  }, 120);
}

function onClick(key) {
  if (open.value === key && (pinned.value || !canHover)) {
    open.value = null;
    pinned.value = false;
    return;
  }
  show(key);
  pinned.value = true;
}

function close() {
  open.value = null;
  pinned.value = false;
}

function onDocPointer(event) {
  if (open.value && root.value && !root.value.contains(event.target)) close();
}

function onKey(event) {
  if (event.key === 'Escape') close();
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer);
  document.addEventListener('keydown', onKey);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer);
  document.removeEventListener('keydown', onKey);
  clearTimeout(closeTimer);
});
</script>

<template>
  <div v-if="loading" class="flex flex-wrap items-center gap-x-3 gap-y-2" aria-busy="true" aria-label="Checking services">
    <span v-for="w in [92, 140, 84]" :key="w" class="flex items-center gap-2.5 px-2.5 py-2" aria-hidden="true">
      <span class="skeleton h-2 w-2 rounded-full"></span>
      <span class="skeleton h-3" :style="{width: `${w}px`}"></span>
    </span>
  </div>
  <div v-else ref="root" class="reveal flex flex-wrap items-center gap-x-3 gap-y-2">
    <div
        v-for="(row, index) in rows"
        :key="row.key"
        class="relative"
        @mouseenter="onEnter(row.key)"
        @mouseleave="onLeave"
    >
      <button
          type="button"
          class="status-trigger press flex items-center gap-2.5 rounded-lg px-2.5 py-2 t-note"
          :class="{'is-open': open === row.key}"
          :aria-expanded="open === row.key"
          :aria-controls="`status-${row.key}`"
          @click="onClick(row.key)"
      >
        <span :class="TONE[row.tone]"></span>
        <span>{{ row.label }}</span>
        <span class="t-read text-dim">{{ row.text }}</span>
      </button>

      <Transition name="pop">
        <div
            v-if="open === row.key"
            :id="`status-${row.key}`"
            role="dialog"
            :aria-label="row.title"
            class="status-pop absolute bottom-full z-40 mb-2 w-[min(19rem,calc(100vw-2.5rem))] p-1.5"
            :class="index === rows.length - 1 ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left'"
        >
          <div class="flex items-baseline justify-between gap-3 px-2.5 pb-1.5 pt-2">
            <span class="text-[0.875rem] font-semibold text-ink">{{ row.title }}</span>
            <span class="t-note">{{ row.text }}</span>
          </div>

          <ul v-if="row.items.length" class="max-h-72 overflow-y-auto">
            <li
                v-for="item in row.items"
                :key="item.id"
                class="flex items-center gap-2.5 rounded-md px-2.5 py-2"
            >
              <span :class="TONE[item.tone]"></span>
              <span class="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">{{ item.name }}</span>
              <span v-if="item.note" class="t-note max-w-[55%] truncate text-right" :title="item.note">{{ item.note }}</span>
            </li>
          </ul>

          <p v-if="row.empty" class="px-2.5 pb-2 pt-1 t-note">{{ row.empty }}</p>
          <p v-if="row.source" class="px-2.5 pb-2 t-note">{{ row.source }}</p>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.status-trigger {
  transition: background-color 120ms var(--ease);
}

.status-trigger:hover,
.status-trigger.is-open {
  background: rgb(var(--raised-rgb));
}

.status-pop {
  background: rgb(58 58 60);
  border: 1px solid rgb(var(--line-rgb));
  border-radius: var(--r-md);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
}

.status-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Grows out of the entry it belongs to and shrinks back into it. */
.pop-enter-active,
.pop-leave-active {
  transition: transform 220ms var(--ease), opacity 160ms var(--ease);
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .pop-enter-active,
  .pop-leave-active {
    transition: opacity 150ms linear;
  }

  .pop-enter-from,
  .pop-leave-to {
    transform: none;
  }
}
</style>
