<script setup>
import {nextTick, onUnmounted, ref, shallowRef, watch} from 'vue';
import {useDetailStore} from '../stores/useDetailStore.js';
import DetailForecast from './details/DetailForecast.vue';
import DetailStream from './details/DetailStream.vue';
import DetailMedia from './details/DetailMedia.vue';
import DetailUpcoming from './details/DetailUpcoming.vue';
import DetailEvent from './details/DetailEvent.vue';
import DetailWear from './details/DetailWear.vue';
import AppIcon from './AppIcon.vue';

/**
 * One detail panel for the whole dashboard. It grows out of the card that
 * was clicked and shrinks back into it when closed, so it is always clear
 * where it came from. Escape, the close button or a click outside closes
 * it; focus moves into the panel and back to the card afterwards.
 */
const store = useDetailStore();

const VIEWS = {
  forecast: DetailForecast,
  stream: DetailStream,
  media: DetailMedia,
  upcoming: DetailUpcoming,
  event: DetailEvent,
  wear: DetailWear,
};

const shown = shallowRef(null);
const phase = ref('closed'); // opening | open | closing | closed
const panel = ref(null);
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const OPEN_MS = 440;
const CLOSE_MS = 300;
let closeTimer = null;

function rectOf(el) {
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  const onScreen = r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
  return onScreen ? r : null;
}

/* The transform that makes the panel sit exactly on top of the card. */
function fromOrigin(el, origin) {
  const target = el.getBoundingClientRect();
  return `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${origin.width / target.width}, ${origin.height / target.height})`;
}

async function openWith(entry) {
  clearTimeout(closeTimer);
  shown.value = entry;
  phase.value = 'opening';
  document.documentElement.style.overflow = 'hidden';
  await nextTick();
  const el = panel.value;
  if (!el) return;
  const origin = rectOf(entry.origin);
  el.style.transition = 'none';
  el.style.transformOrigin = 'top left';
  el.style.transform = !reduceMotion && origin ? fromOrigin(el, origin) : reduceMotion ? 'none' : 'scale(0.96)';
  el.style.opacity = '0';
  el.getBoundingClientRect(); // commit the starting frame
  requestAnimationFrame(() => {
    el.style.transition = reduceMotion
      ? 'opacity 160ms linear'
      : `transform ${OPEN_MS}ms var(--ease), opacity 180ms var(--ease)`;
    el.style.transform = 'none';
    el.style.opacity = '1';
    phase.value = 'open';
    el.focus({preventScroll: true});
  });
}

function closeAnim() {
  const entry = shown.value;
  const el = panel.value;
  if (!entry || !el) {
    finish(entry);
    return;
  }
  phase.value = 'closing';
  const origin = rectOf(entry.origin);
  el.style.transformOrigin = 'top left';
  el.style.transition = reduceMotion
    ? 'opacity 140ms linear'
    : `transform ${CLOSE_MS}ms var(--ease), opacity ${CLOSE_MS}ms var(--ease)`;
  if (!reduceMotion) el.style.transform = origin ? fromOrigin(el, origin) : 'scale(0.96)';
  el.style.opacity = '0';
  closeTimer = setTimeout(() => finish(entry), reduceMotion ? 140 : CLOSE_MS);
}

function finish(entry) {
  shown.value = null;
  phase.value = 'closed';
  document.documentElement.style.overflow = '';
  entry?.origin?.focus?.({preventScroll: true});
}

watch(
  () => store.current,
  (next) => {
    if (next) openWith(next);
    else if (shown.value) closeAnim();
  }
);

function onKey(event) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    store.close();
    return;
  }
  // Keep Tab inside the panel while it is open.
  if (event.key === 'Tab' && panel.value) {
    const items = [...panel.value.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

onUnmounted(() => {
  clearTimeout(closeTimer);
  document.documentElement.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <div
        v-if="shown"
        class="sheet-layer fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
        :class="`is-${phase}`"
        @keydown="onKey"
    >
      <div class="sheet-scrim absolute inset-0" aria-hidden="true" @click="store.close()"></div>
      <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          class="sheet-panel relative flex max-h-[min(88vh,52rem)] w-full max-w-[34rem] flex-col overflow-hidden outline-none"
      >
        <button
            type="button"
            class="sheet-close press absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full"
            aria-label="Close"
            @click="store.close()"
        >
          <AppIcon :size="16" name="close"/>
        </button>
        <div class="sheet-body min-h-0 overflow-y-auto">
          <component :is="VIEWS[shown.type]" :data="shown.data"/>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-scrim {
  background: rgb(0 0 0 / 0.55);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  transition: opacity 360ms var(--ease);
}

.is-opening .sheet-scrim,
.is-closing .sheet-scrim {
  opacity: 0;
}

.sheet-panel {
  background: rgb(var(--raised-rgb));
  border: 1px solid rgb(var(--line-soft-rgb));
  border-radius: 22px;
  box-shadow: 0 30px 80px rgb(0 0 0 / 0.6);
  will-change: transform, opacity;
}

/* While the panel is still stretching out of the card its contents would
   look squashed, so they arrive a moment later and leave first. */
.sheet-body {
  transition: opacity 200ms var(--ease) 120ms;
}

.is-opening .sheet-body,
.is-closing .sheet-body {
  opacity: 0;
  transition-delay: 0ms;
}

.sheet-close {
  background: rgb(var(--line-soft-rgb) / 0.9);
  color: rgb(var(--text-dim-rgb));
}

.sheet-close:hover {
  color: rgb(var(--text-rgb));
}

.sheet-close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-transparency: reduce) {
  .sheet-scrim {
    background: rgb(0 0 0 / 0.8);
    backdrop-filter: none;
  }
}
</style>
