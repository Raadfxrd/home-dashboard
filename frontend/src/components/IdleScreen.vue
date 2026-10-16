<script setup>
import {computed, onMounted, onUnmounted, ref} from 'vue';
import WeatherBackdrop from './WeatherBackdrop.vue';
import RollingNumber from './RollingNumber.vue';

/**
 * The calm view the dashboard eases into when nobody is using it: the time,
 * the temperature and the rain outlook over the live weather. The content
 * drifts a few pixels every minute so nothing burns into a TV or OLED
 * screen, and after sunset it dims further.
 *
 * The touch that wakes it is swallowed, so it never also presses whatever
 * was underneath on the dashboard.
 */
const props = defineProps({
  clock: {type: String, default: ''},
  date: {type: String, default: ''},
  here: {type: Object, default: null},
  outlook: {type: Object, default: null},
});

const emit = defineEmits(['wake']);

const hours = computed(() => (props.clock || '').split(':')[0] || '--');
const minutes = computed(() => (props.clock || '').split(':')[1] || '--');
const rainNow = computed(() => props.outlook?.rain?.slots?.[0]?.mm || 0);
const rainText = computed(() => props.outlook?.rain?.summary || '');

/* Night from sunset to sunrise ("HH:MM" local); 22:00–07:00 if unknown. */
const night = computed(() => {
  const now = props.clock || '';
  const rise = props.here?.sunrise || '07:00';
  const set = props.here?.sunset || '22:00';
  return now >= set || now < rise;
});

const drift = ref({x: 0, y: 0});
let driftTimer = null;
function moveOn() {
  // A slow wander within a small box; never a jump.
  drift.value = {x: Math.round((Math.random() - 0.5) * 48), y: Math.round((Math.random() - 0.5) * 32)};
}

function swallowNextClick() {
  const stop = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, {capture: true, once: true});
  setTimeout(() => window.removeEventListener('click', stop, {capture: true}), 600);
}

function onPointerDown(event) {
  event.preventDefault();
  event.stopPropagation();
  swallowNextClick();
  emit('wake');
}

onMounted(() => {
  driftTimer = setInterval(moveOn, 60000);
});

onUnmounted(() => clearInterval(driftTimer));
</script>

<template>
  <div
      class="idle fixed inset-0 z-[60] cursor-none select-none bg-base"
      :class="{'is-night': night}"
      role="dialog"
      aria-label="Idle screen. Touch or press any key to return."
      @pointerdown="onPointerDown"
  >
    <WeatherBackdrop
        v-if="here"
        class="idle-weather"
        :condition-id="here.conditionId"
        :rain-now="rainNow"
        :wind-speed="here.windSpeed"
    />

    <div class="idle-content absolute inset-0 flex items-center justify-center p-[6vmin]">
      <div class="flex flex-col items-center text-center" :style="{transform: `translate(${drift.x}px, ${drift.y}px)`}">
        <p class="idle-clock t-read flex items-baseline font-semibold text-ink">
          <RollingNumber :value="hours" digit-width="0.57em" fallback="--"/>
          <span class="mx-[-0.02em] text-faint">:</span>
          <RollingNumber :value="minutes" digit-width="0.57em" fallback="--"/>
        </p>
        <p class="mt-[1.5vmin] text-[clamp(1rem,2.4vmin,1.6rem)] tracking-[-0.01em] text-dim">{{ date }}</p>

        <div v-if="here" class="mt-[6vmin] flex flex-col items-center gap-[1.2vmin]">
          <p class="flex items-baseline gap-[1.5vmin] text-[clamp(1.25rem,3.6vmin,2.6rem)] tracking-[-0.02em] text-ink">
            <span class="font-semibold">{{ here.temperature }}°</span>
            <span class="text-dim first-letter:uppercase">{{ here.condition }}</span>
          </p>
          <p v-if="rainText" class="text-[clamp(0.95rem,2.2vmin,1.5rem)] text-dim">{{ rainText }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.idle-clock {
  font-size: clamp(5rem, 22vmin, 16rem);
  line-height: 0.92;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

/* The weather fills the whole screen here, without the page's bottom fade. */
.idle-weather {
  -webkit-mask-image: none !important;
  mask-image: none !important;
}

/* The drift is slow enough that it never reads as movement. */
.idle-content > div {
  transition: transform 8s var(--ease);
}

/* At night everything steps down, the weather most of all. */
.idle-content,
.idle-weather {
  transition: opacity 3s var(--ease);
}

.is-night .idle-content {
  opacity: 0.55;
}

.is-night .idle-weather {
  opacity: 0.4;
}

@media (prefers-reduced-motion: reduce) {
  .idle-content > div {
    transition: none;
  }
}
</style>
