<script setup>
import {nextTick, onMounted, onUnmounted, ref, watch} from 'vue';

/**
 * A segmented control with a thumb that slides to the chosen option.
 * The thumb's corners sit concentric inside the track (outer radius minus
 * the padding), so the two curves read as one shape. Arrow keys move the
 * choice; with reduced motion the thumb changes place without sliding.
 */
const props = defineProps({
  modelValue: {type: String, required: true},
  options: {type: Array, required: true}, // [{value, label}]
  label: {type: String, required: true},
  size: {type: String, default: 'md'}, // 'md' | 'sm'
});

const emit = defineEmits(['update:modelValue']);

const track = ref(null);
const buttons = ref([]);
const thumb = ref({x: 0, w: 0, ready: false});
let resizeObserver = null;

function place() {
  const index = props.options.findIndex((o) => o.value === props.modelValue);
  const el = buttons.value[index];
  if (!el) return;
  thumb.value = {x: el.offsetLeft, w: el.offsetWidth, ready: thumb.value.ready || el.offsetWidth > 0};
}

function choose(value) {
  if (value !== props.modelValue) emit('update:modelValue', value);
}

function onKey(event) {
  const index = props.options.findIndex((o) => o.value === props.modelValue);
  let next = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(props.options.length - 1, index + 1);
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, index - 1);
  else return;
  event.preventDefault();
  choose(props.options[next].value);
  nextTick(() => buttons.value[next]?.focus());
}

watch(() => [props.modelValue, props.options.length], () => nextTick(place));

onMounted(() => {
  place();
  resizeObserver = new ResizeObserver(place);
  resizeObserver.observe(track.value);
  // Fonts can land after mount and change every button's width.
  document.fonts?.ready?.then(place);
});

onUnmounted(() => resizeObserver?.disconnect());
</script>

<template>
  <div
      ref="track"
      role="radiogroup"
      :aria-label="label"
      class="seg glass relative inline-flex shrink-0"
      :class="size === 'sm' ? 'seg-sm' : 'seg-md'"
      @keydown="onKey"
  >
    <span
        class="seg-thumb pointer-events-none absolute"
        :class="{'is-ready': thumb.ready}"
        :style="{width: `${thumb.w}px`, transform: `translateX(${thumb.x}px)`}"
        aria-hidden="true"
    ></span>
    <button
        v-for="(option, i) in options"
        :key="option.value"
        :ref="(el) => (buttons[i] = el)"
        type="button"
        role="radio"
        class="seg-button relative"
        :class="modelValue === option.value ? 'is-on text-ink' : 'text-dim hover:text-ink'"
        :aria-checked="modelValue === option.value"
        :tabindex="modelValue === option.value ? 0 : -1"
        @click="choose(option.value)"
    >{{ option.label }}</button>
  </div>
</template>

<style scoped>
/* Track radius R, padding P, thumb radius R − P: concentric corners. */
.seg {
  --seg-pad: 3px;
  --seg-radius: 10px;
  padding: var(--seg-pad);
  border-radius: var(--seg-radius);
}

.seg-sm {
  --seg-pad: 2px;
  --seg-radius: 8px;
}

.seg-thumb {
  top: var(--seg-pad);
  bottom: var(--seg-pad);
  left: 0;
  border-radius: calc(var(--seg-radius) - var(--seg-pad));
  background: rgb(255 255 255 / 0.15);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), inset 0 0.5px 0 rgb(255 255 255 / 0.12);
  opacity: 0;
}

/* Only slide once it has a first position, so it doesn't fly in on load. */
.seg-thumb.is-ready {
  opacity: 1;
  transition: transform 340ms var(--ease), width 340ms var(--ease);
}

.seg-button {
  border-radius: calc(var(--seg-radius) - var(--seg-pad));
  transition: color 160ms var(--ease), transform 120ms ease-out;
  -webkit-tap-highlight-color: transparent;
}

.seg-md .seg-button {
  height: 2.25rem;
  padding: 0 0.875rem;
  font-size: 0.8125rem;
}

.seg-sm .seg-button {
  height: 1.625rem;
  padding: 0 0.625rem;
  font-size: 0.75rem;
}

.seg-button {
  /* One weight for every state, so choosing never changes widths. */
  font-weight: 500;
}

/* Feedback on press, not on release. */
.seg-button:active {
  transform: scale(0.96);
}

.seg-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

@media (prefers-reduced-motion: reduce) {
  .seg-thumb.is-ready {
    transition: opacity 150ms linear;
  }

  .seg-button:active {
    transform: none;
  }
}
</style>
