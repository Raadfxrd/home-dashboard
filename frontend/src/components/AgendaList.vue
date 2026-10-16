<script setup>
import {computed, onUnmounted, ref, watch} from 'vue';
import AppIcon from './AppIcon.vue';
import {agenda, clock} from '../composables/dayPlan.js';
import {useDetailStore} from '../stores/useDetailStore.js';

/* Today's and tomorrow's appointments under the clock, like a lock screen.
   Places you go get a pin; a tap opens the event with its weather. */
const props = defineProps({
  calendar: {type: Object, default: null},
  now: {type: Number, default: () => Date.now()},
  // Roughly how many rows fit; less when something is playing below.
  budget: {type: Number, default: 9},
});

const detail = useDetailStore();

/* Wide enough, the days sit side by side (Today | Tomorrow | Sunday), so
   more of the week fits without making the hero taller. */
const root = ref(null);
const width = ref(0);
const observer = new ResizeObserver(([entry]) => (width.value = entry.contentRect.width));
// The section only exists once the calendar has answered.
watch(root, (el, old) => {
  if (old) observer.unobserve(old);
  if (el) observer.observe(el);
});
onUnmounted(() => observer.disconnect());
const columns = computed(() => (width.value >= 760 ? 3 : width.value >= 500 ? 2 : 1));

/* Fill the space day by day: today always gets its first few, later days
   come in while there's room. A day header costs about a row, an event
   with a place a bit more than one. With columns, each day has its own. */
function fit(day, room) {
  const items = [];
  for (const e of day.items) {
    const cost = e.out ? 1.4 : 1;
    if (items.length && room < cost) break;
    items.push(e);
    room -= cost;
  }
  return {items, room};
}

const days = computed(() => {
  const all = agenda(props.calendar?.events || [], props.now, 7);
  if (columns.value > 1) {
    return all.slice(0, columns.value).map((day) => {
      const {items} = fit(day, Math.max(3, props.budget));
      return {...day, items, more: day.items.length - items.length};
    });
  }
  let room = props.budget;
  const out = [];
  for (const day of all) {
    if (out.length && room < 2) break;
    const {items, room: left} = fit(day, room - 0.8);
    room = left;
    out.push({...day, items, more: day.items.length - items.length});
    if (items.length < day.items.length) break;
  }
  return out;
});

function when(e) {
  if (e.allDay) return 'All day';
  return Date.parse(e.start) <= props.now ? `Until ${clock(e.end)}` : clock(e.start);
}
</script>

<template>
  <section v-if="calendar?.configured" ref="root">
    <p v-if="calendar.error" class="flex items-center gap-2 t-note"><span class="dot dot-warn"></span>Calendar: {{ calendar.error }}</p>
    <p v-else-if="!days.length && calendar.online" class="t-note">Nothing on your calendar this week.</p>

    <div class="grid gap-x-8" :style="{gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`}">
    <div v-for="day in days" :key="day.key" class="min-w-0" :class="columns === 1 ? 'mb-4 last:mb-0' : ''">
      <h2 class="mb-1.5 text-[0.8125rem] font-semibold text-dim">{{ day.label }}</h2>
      <ul class="flex flex-col">
        <li v-for="e in day.items" :key="e.id">
          <button
              type="button"
              class="agenda-row press -mx-2 flex w-[calc(100%+1rem)] items-baseline gap-3 rounded-md px-2 py-1.5 text-left"
              @click="detail.open('event', e, $event)"
          >
            <span class="w-[4.5rem] shrink-0 text-[0.8125rem] tabular-nums text-dim">{{ when(e) }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[0.9375rem] text-ink">{{ e.title }}</span>
              <span v-if="e.out" class="flex items-center gap-1 truncate text-[0.75rem] text-faint">
                <AppIcon :size="12" name="pin" class="shrink-0"/>{{ e.location }}
              </span>
            </span>
          </button>
        </li>
      </ul>
      <p v-if="day.more" class="mt-0.5 pl-[5.25rem] t-note text-[0.75rem]">and {{ day.more }} more</p>
    </div>
    </div>
  </section>
</template>

<style scoped>
.agenda-row {
  transition: background-color 120ms var(--ease);
}

.agenda-row:hover {
  background: rgb(var(--raised-rgb) / 0.7);
}

.agenda-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
