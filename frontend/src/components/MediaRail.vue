<script setup>
import {nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
import MediaCard from './MediaCard.vue';

/**
 * A horizontal rail you can throw. Dragging tracks the pointer 1:1; on
 * release the rail keeps the velocity it had and decelerates to where the
 * gesture was heading, rather than snapping back from the release point.
 */
const props = defineProps({
  title: {type: String, required: true},
  items: {type: Array, default: () => []},
  isLoading: {type: Boolean, default: false},
  error: {type: String, default: null},
});

const railRef = ref(null);
const atStart = ref(true);
const atEnd = ref(false);
const dragging = ref(false);

let pointerId = null;
let startX = 0;
let startScroll = 0;
let moved = false;
let samples = [];
let decayFrame = 0;

function updateEdges() {
  const el = railRef.value;
  if (!el) return;
  const overflow = el.scrollWidth - el.clientWidth;
  atStart.value = el.scrollLeft <= 2;
  atEnd.value = overflow <= 4 || el.scrollLeft >= overflow - 2;
}

/* Apple's projection: where momentum would carry you, not where you let go. */
function project(velocity, decelerationRate = 0.996) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

function stopDecay() {
  if (decayFrame) {
    cancelAnimationFrame(decayFrame);
    decayFrame = 0;
  }
}

function onPointerDown(event) {
  if (event.pointerType === 'touch') return; // native touch scrolling is already right
  const el = railRef.value;
  if (!el || el.scrollWidth <= el.clientWidth) return;

  stopDecay();
  pointerId = event.pointerId;
  startX = event.clientX;
  startScroll = el.scrollLeft;
  moved = false;
  samples = [{x: event.clientX, t: performance.now()}];
}

function onPointerMove(event) {
  if (event.pointerId !== pointerId) return;
  const el = railRef.value;
  if (!el) return;

  const dx = event.clientX - startX;
  // ~8px of hysteresis before this counts as a drag, so clicks still land.
  if (!moved && Math.abs(dx) < 8) return;

  if (!moved) {
    moved = true;
    dragging.value = true;
    el.setPointerCapture?.(pointerId);
  }

  el.scrollLeft = startScroll - dx;
  samples.push({x: event.clientX, t: performance.now()});
  if (samples.length > 6) samples.shift();
  updateEdges();
}

function onPointerUp(event) {
  if (event.pointerId !== pointerId) return;
  const el = railRef.value;
  pointerId = null;

  if (!moved || !el) {
    dragging.value = false;
    return;
  }

  el.releasePointerCapture?.(event.pointerId);
  dragging.value = false;

  // Velocity from the last few samples, not just the final event.
  const recent = samples.filter((s) => performance.now() - s.t < 120);
  let velocity = 0;
  if (recent.length >= 2) {
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = last.t - first.t;
    if (dt > 0) velocity = ((last.x - first.x) / dt) * 1000;
  }

  if (Math.abs(velocity) < 60) {
    updateEdges();
    return;
  }

  const target = el.scrollLeft - project(velocity);
  const max = el.scrollWidth - el.clientWidth;
  const clamped = Math.max(0, Math.min(max, target));

  // Decelerate toward the projected point, starting from the current value.
  const from = el.scrollLeft;
  const distance = clamped - from;
  const duration = Math.min(900, 220 + Math.abs(distance) * 0.7);
  const t0 = performance.now();

  const step = () => {
    const p = Math.min(1, (performance.now() - t0) / duration);
    // Matches the interface's standard curve: fast out, settle in.
    const eased = 1 - Math.pow(1 - p, 3);
    el.scrollLeft = from + distance * eased;
    updateEdges();
    decayFrame = p < 1 ? requestAnimationFrame(step) : 0;
  };
  decayFrame = requestAnimationFrame(step);
}

/* A click that followed a drag shouldn't open anything. */
function onClickCapture(event) {
  if (moved) {
    event.preventDefault();
    event.stopPropagation();
    moved = false;
  }
}

function onWheel(event) {
  const el = railRef.value;
  if (!el) return;
  // Let a genuine horizontal gesture (trackpad) through untouched.
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  if (!event.shiftKey) return;
  if (el.scrollWidth <= el.clientWidth) return;
  event.preventDefault();
  stopDecay();
  el.scrollLeft += event.deltaY;
  updateEdges();
}

watch(
    () => [props.items.length, props.isLoading, props.error],
    async () => {
      await nextTick();
      updateEdges();
    },
    {immediate: true}
);

onMounted(() => {
  window.addEventListener('resize', updateEdges);
  updateEdges();
});

onUnmounted(() => {
  window.removeEventListener('resize', updateEdges);
  stopDecay();
});
</script>

<template>
  <div>
    <h3 class="mb-3 text-[0.8125rem] text-dim">{{ title }}</h3>

    <div v-if="isLoading" class="flex gap-3 overflow-hidden">
      <div v-for="i in 8" :key="i" class="w-[7.5rem] flex-none sm:w-[8.5rem]">
        <div class="well aspect-[2/3] animate-pulse"></div>
        <div class="mt-2 h-3 w-4/5 animate-pulse rounded bg-line-soft"></div>
      </div>
    </div>

    <p v-else-if="error" class="panel flex items-center gap-2.5 p-4 t-note">
      <span class="dot dot-fault"></span>{{ error }}
    </p>

    <p v-else-if="!items.length" class="panel p-4 t-note">Nothing here yet.</p>

    <div v-else class="relative">
      <div
          ref="railRef"
          :class="dragging ? 'cursor-grabbing select-none' : 'cursor-grab'"
          class="scrollbar-hide flex gap-3 overflow-x-auto pb-1"
          @scroll="updateEdges"
          @wheel="onWheel"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @click.capture="onClickCapture"
      >
        <MediaCard
            v-for="item in items"
            :key="item.id"
            :item="item"
            class="w-[7.5rem] flex-none sm:w-[8.5rem]"
        />
      </div>

      <!-- Edge fades, so the rail reads as continuing rather than stopping. -->
      <div
          v-show="!atStart"
          class="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-base to-transparent"
      ></div>
      <div
          v-show="!atEnd"
          class="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-base to-transparent"
      ></div>
    </div>
  </div>
</template>
