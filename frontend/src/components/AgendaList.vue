<script setup>
import {computed} from 'vue';
import AppIcon from './AppIcon.vue';
import {agenda, clock} from '../composables/dayPlan.js';
import {useDetailStore} from '../stores/useDetailStore.js';

/* Today's and tomorrow's appointments under the clock, like a lock screen.
   Places you go get a pin; a tap opens the event with its weather. */
const props = defineProps({
  calendar: {type: Object, default: null},
  now: {type: Number, default: () => Date.now()},
});

const detail = useDetailStore();
const MAX_TODAY = 4;
const MAX_TOMORROW = 2;

const days = computed(() => {
  const {today, tomorrow} = agenda(props.calendar?.events || [], props.now);
  return [
    {key: 'today', label: 'Today', items: today.slice(0, MAX_TODAY), more: Math.max(0, today.length - MAX_TODAY)},
    {key: 'tomorrow', label: 'Tomorrow', items: tomorrow.slice(0, MAX_TOMORROW), more: Math.max(0, tomorrow.length - MAX_TOMORROW)},
  ].filter((d) => d.items.length);
});

function when(e) {
  if (e.allDay) return 'All day';
  return Date.parse(e.start) <= props.now ? `Until ${clock(e.end)}` : clock(e.start);
}
</script>

<template>
  <section v-if="calendar?.configured" class="max-w-[36rem]">
    <p v-if="calendar.error" class="flex items-center gap-2 t-note"><span class="dot dot-warn"></span>Calendar: {{ calendar.error }}</p>
    <p v-else-if="!days.length && calendar.online" class="t-note">Nothing on your calendar today or tomorrow.</p>

    <div v-for="day in days" :key="day.key" class="mb-4 last:mb-0">
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
