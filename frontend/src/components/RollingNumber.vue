<script setup>
import {computed} from 'vue';

/**
 * Digits slide to their new value instead of cutting. On a display that is
 * glanced at, the movement is what tells you a number changed — so it is
 * only ever applied to digits, never to the surrounding text.
 */
const props = defineProps({
  value: {type: [Number, String], default: null},
  fallback: {type: String, default: '—'},
  suffix: {type: String, default: ''},
  decimals: {type: Number, default: 0},
  /* Digit box width in em. Large display numerals want a tighter box than
     the default, or they read as though they were letter-spaced. */
  digitWidth: {type: String, default: '0.62em'},
});

const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const display = computed(() => {
  if (props.value === null || props.value === undefined || props.value === '') {
    return props.fallback;
  }
  if (typeof props.value === 'number') {
    if (!Number.isFinite(props.value)) return props.fallback;
    const formatted = props.decimals > 0 ? props.value.toFixed(props.decimals) : String(Math.round(props.value));
    return `${formatted}${props.suffix}`;
  }
  return `${String(props.value)}${props.suffix}`;
});

const characters = computed(() => display.value.split(''));

const isDigit = (char) => /^\d$/.test(char);
const digitStyle = (char) => ({transform: `translateY(-${Number(char)}em)`});
</script>

<template>
  <span class="rolling" :style="{'--digit-w': digitWidth}" aria-live="polite">
    <span v-for="(char, index) in characters" :key="index" class="rolling-char">
      <span v-if="isDigit(char)" class="window">
        <span class="strip" :style="digitStyle(char)">
          <span v-for="digit in digits" :key="digit" class="digit">{{ digit }}</span>
        </span>
      </span>
      <span v-else class="literal">{{ char }}</span>
    </span>
  </span>
</template>

<style scoped>
.rolling {
  display: inline-flex;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
}

.rolling-char {
  display: inline-flex;
}

.window {
  position: relative;
  width: var(--digit-w, 0.62em);
  height: 1em;
  overflow: hidden;
}

.strip {
  display: flex;
  flex-direction: column;
  /* Critically damped — the digit arrives and settles, it never overshoots. */
  transition: transform 420ms cubic-bezier(0.32, 0.72, 0, 1);
}

.digit {
  height: 1em;
  line-height: 1em;
  text-align: center;
}

.literal {
  line-height: 1em;
}

@media (prefers-reduced-motion: reduce) {
  .strip {
    transition: none;
  }
}
</style>
