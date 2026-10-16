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
  containers: {type: Object, default: null},
  log: {type: Array, default: () => []},
  calendar: {type: Object, default: null},
  loading: {type: Boolean, default: false},
});

const emit = defineEmits(['clear-log']);

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

function megabytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const mb = bytes / 1048576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/* "Exited (0) 2 hours ago" → "stopped 2 hours ago" */
function stoppedText(status = '') {
  const ago = /\)\s*(.+)$/.exec(status)?.[1];
  return ago ? `stopped ${ago}` : 'stopped';
}

const containerRow = computed(() => {
  const c = props.containers;
  const base = {key: 'containers', label: 'Containers', title: 'Containers'};
  if (!c?.configured) {
    return {...base, tone: 'off', text: 'not connected', items: [], empty: 'Mount the Docker socket to list containers (deploy.sh does this).'};
  }
  if (!c.online) return {...base, tone: 'fault', text: 'unavailable', items: [], empty: c.error || 'Docker did not answer.'};
  const unhealthy = c.items.some((i) => i.health === 'unhealthy');
  const stopped = c.total - c.running;
  return {
    ...base,
    tone: unhealthy ? 'fault' : stopped ? 'warn' : 'live',
    text: `${c.running}/${c.total}`,
    items: c.items.map((i) => ({
      id: i.id,
      name: i.name,
      tone: i.state !== 'running' ? 'warn' : i.health === 'unhealthy' ? 'fault' : 'live',
      note: i.state !== 'running'
        ? stoppedText(i.status)
        : [megabytes(i.memoryBytes), Number.isFinite(i.cpuPercent) ? `${i.cpuPercent}%` : ''].filter(Boolean).join('  '),
    })),
    empty: c.items.length ? '' : 'No containers.',
  };
});

/* Which calendars the agenda reads, with this week's count, and the ones it
   leaves out. Calendars on your Mac that aren't here live outside iCloud
   (subscribed, Outlook, Google) and need their .ics link instead. */
const calendarRow = computed(() => {
  const c = props.calendar;
  const base = {key: 'calendar', label: 'Calendar', title: 'Calendars'};
  if (!c?.configured) {
    return {...base, tone: 'off', text: 'not connected', items: [], empty: 'Add ICLOUD_USERNAME and an app-specific ICLOUD_APP_PASSWORD to .env.'};
  }
  const sources = c.sources || (c.calendars || []).map((name) => ({name, source: 'iCloud', count: null}));
  const read = sources.filter((s) => !s.skipped && !s.error);
  const failed = sources.filter((s) => s.error);
  return {
    ...base,
    tone: c.error && !read.length ? 'fault' : c.error || failed.length ? 'warn' : 'live',
    text: read.length ? String(read.length) : c.error ? 'error' : '0',
    items: [
      ...read.map((s) => ({id: `r-${s.name}`, name: s.name, tone: 'live', note: [s.source === 'feed' ? 'feed' : '', s.count != null ? `${s.count} this week` : ''].filter(Boolean).join(' · ')})),
      ...failed.map((s) => ({id: `f-${s.name}`, name: s.name, tone: 'fault', note: 'unreadable', detail: s.error})),
      ...sources.filter((s) => s.skipped).map((s) => ({id: `s-${s.name}`, name: s.name, tone: 'off', note: s.skipped})),
    ],
    empty: c.error || (sources.length ? '' : 'No calendars found.'),
  };
});

const agoFmt = new Intl.RelativeTimeFormat('en', {numeric: 'auto'});
function ago(t) {
  const s = Math.round((t - Date.now()) / 1000);
  if (s > -60) return 'just now';
  if (s > -3600) return agoFmt.format(Math.round(s / 60), 'minute');
  if (s > -86400) return agoFmt.format(Math.round(s / 3600), 'hour');
  return agoFmt.format(Math.round(s / 86400), 'day');
}

const SOURCE_NAMES = {
  jellyfin: 'Jellyfin', weather: 'Weather', nas: 'NAS', prowlarr: 'Prowlarr', qbittorrent: 'qBittorrent',
  nzbget: 'NZBGet', sonarr: 'Sonarr', radarr: 'Radarr', docker: 'Docker', calendar: 'Calendar', server: 'Dashboard',
};

/* The log's dot says how recent and how bad: red for an error in the last
   hour, orange for a recent warning, green when the last hour was clean. */
const logRow = computed(() => {
  const hourAgo = Date.now() - 3600000;
  const recent = props.log.filter((e) => e.lastAt >= hourAgo);
  const tone = recent.some((e) => e.level === 'error') ? 'fault' : recent.length ? 'warn' : 'live';
  return {
    key: 'log',
    label: 'Log',
    title: 'Recent problems',
    tone,
    text: props.log.length ? String(props.log.length) : 'clear',
    wide: true,
    items: props.log.map((e) => ({
      id: e.id,
      name: SOURCE_NAMES[e.source] || e.source,
      tone: e.level === 'error' ? 'fault' : 'warn',
      note: `${ago(e.lastAt)}${e.count > 1 ? `  ×${e.count}` : ''}`,
      detail: e.message,
    })),
    empty: props.log.length ? '' : 'Nothing has gone wrong since the dashboard started.',
    action: props.log.length ? {label: 'Clear', run: () => emit('clear-log')} : null,
  };
});

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
  containerRow.value,
  calendarRow.value,
  logRow.value,
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
    <span v-for="w in [92, 140, 84, 100, 48]" :key="w" class="flex items-center gap-2.5 px-2.5 py-2" aria-hidden="true">
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
            class="status-pop absolute bottom-full z-40 mb-2 p-1.5"
            :class="[
              row.wide ? 'w-[min(26rem,calc(100vw-2.5rem))]' : 'w-[min(19rem,calc(100vw-2.5rem))]',
              index >= rows.length - 2 ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left',
            ]"
        >
          <div class="flex items-center justify-between gap-3 px-2.5 pb-1.5 pt-2">
            <span class="text-[0.875rem] font-semibold text-ink">{{ row.title }}</span>
            <button
                v-if="row.action"
                type="button"
                class="press rounded-md px-2 py-1 text-[0.75rem] text-dim hover:bg-line-soft hover:text-ink"
                @click="row.action.run()"
            >{{ row.action.label }}</button>
            <span v-else class="t-note">{{ row.text }}</span>
          </div>

          <ul v-if="row.items.length" class="max-h-72 overflow-y-auto">
            <li
                v-for="item in row.items"
                :key="item.id"
                class="rounded-md px-2.5 py-2"
            >
              <span class="flex items-center gap-2.5">
                <span :class="TONE[item.tone]"></span>
                <span class="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">{{ item.name }}</span>
                <span v-if="item.note" class="t-note max-w-[55%] truncate whitespace-pre text-right tabular-nums" :title="item.note">{{ item.note }}</span>
              </span>
              <span v-if="item.detail" class="log-detail mt-1 block pl-[1.125rem] text-[0.75rem] leading-snug text-dim" :title="item.detail">{{ item.detail }}</span>
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

.log-detail {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
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
