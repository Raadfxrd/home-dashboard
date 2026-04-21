<script setup>
import {computed} from 'vue';

const props = defineProps({
  value: {type: [Number, String], default: null},
  fallback: {type: String, default: '—'},
  suffix: {type: String, default: ''},
  decimals: {type: Number, default: 0},
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

function isDigit(char) {
  return /^\d$/.test(char);
}

function digitStyle(char) {
  return {
    transform: `translateY(-${Number(char)}em)`,
  };
}
</script>

<template>
  <span class="rolling-number" aria-live="polite">
    <span v-for="(char, index) in characters" :key="index" class="rolling-char">
      <span v-if="isDigit(char)" class="digit-window">
        <span class="digit-strip" :style="digitStyle(char)">
          <span v-for="digit in digits" :key="digit" class="digit">{{ digit }}</span>
        </span>
      </span>
      <span v-else class="literal">{{ char }}</span>
    </span>
  </span>
</template>

<style scoped>
.rolling-number {
  display: inline-flex;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
}

.rolling-char {
  display: inline-flex;
}

.digit-window {
  position: relative;
  width: 0.66em;
  height: 1em;
  overflow: hidden;
}

.digit-strip {
  display: flex;
  flex-direction: column;
  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
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
  .digit-strip {
    transition: none;
  }
}
</style>
