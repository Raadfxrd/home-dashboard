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
 * One detail panel for the whole dashboard. It rises out of the direction
 * of the card that was clicked (a short drift and a gentle scale, never a
 * stretch), then its contents settle in one after another. Closing sends it
 * back toward the card. Escape, the close button or a click outside closes
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
const OPEN_MS = 420;
const CLOSE_MS = 220;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
let closeTimer = null;

function rectOf(el) {
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  const onScreen = r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
  return onScreen ? r : null;
}

/* A hint of where the panel came from: part of the way toward the card's
   centre, uniformly scaled down, so nothing ever looks squashed. */
function towardOrigin(el, origin, scale) {
  if (!origin) return `translateY(12px) scale(${scale})`;
  const target = el.getBoundingClientRect();
  const dx = (origin.left + origin.width / 2 - (target.left + target.width / 2)) * 0.18;
  const dy = (origin.top + origin.height / 2 - (target.top + target.height / 2)) * 0.18;
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

async function openWith(entry) {
  clearTimeout(closeTimer);
  shown.value = null;
  await nextTick(); // a fresh mount restarts the content stagger
  shown.value = entry;
  phase.value = 'opening';
  document.documentElement.style.overflow = 'hidden';
  await nextTick();
  const el = panel.value;
  if (!el) return;
  el.style.transition = 'none';
  el.style.transformOrigin = 'center';
  el.style.transform = reduceMotion ? 'none' : towardOrigin(el, rectOf(entry.origin), 0.94);
  el.style.opacity = '0';
  el.getBoundingClientRect(); // commit the starting frame
  requestAnimationFrame(() => {
    el.style.transition = reduceMotion
      ? 'opacity 160ms linear'
      : `transform ${OPEN_MS}ms ${EASE_OUT}, opacity 200ms ${EASE_OUT}`;
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
  el.style.transition = reduceMotion
    ? 'opacity 140ms linear'
    : `transform ${CLOSE_MS}ms ${EASE_IN}, opacity ${CLOSE_MS}ms ${EASE_IN}`;
  if (!reduceMotion) el.style.transform = towardOrigin(el, rectOf(entry.origin), 0.96);
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
  transition: opacity 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.is-closing .sheet-scrim {
  transition-duration: 220ms;
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

/* Staggered content: each block of the view (heading, rows, overview,
   buttons…) rises and sharpens a beat after the one before it. Keyframes
   rather than transitions, so blocks that arrive later (a loaded overview)
   settle in the same way. */
.sheet-body :deep(article > :not(dl):not(ul)),
.sheet-body :deep(article dl > div),
.sheet-body :deep(article ul > li) {
  animation: sheet-item 460ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(70ms + var(--i, 9) * 38ms);
}

.sheet-body :deep(article > :nth-child(1)) { --i: 0; }
.sheet-body :deep(article > :nth-child(2)) { --i: 1; }
.sheet-body :deep(article > :nth-child(3)) { --i: 2; }
.sheet-body :deep(article > :nth-child(4)) { --i: 3; }
.sheet-body :deep(article > :nth-child(5)) { --i: 4; }
.sheet-body :deep(article > :nth-child(6)) { --i: 5; }
.sheet-body :deep(article > :nth-child(7)) { --i: 6; }
.sheet-body :deep(article > :nth-child(8)) { --i: 7; }

/* Lists inside the view (detail rows, the outfit) continue the cascade
   row by row from where their block sits. */
.sheet-body :deep(article dl > div),
.sheet-body :deep(article ul > li) {
  animation-delay: calc(70ms + var(--i, 9) * 38ms + var(--r, 8) * 30ms);
}

.sheet-body :deep(article :is(dl, ul) > :nth-child(1)) { --r: 0; }
.sheet-body :deep(article :is(dl, ul) > :nth-child(2)) { --r: 1; }
.sheet-body :deep(article :is(dl, ul) > :nth-child(3)) { --r: 2; }
.sheet-body :deep(article :is(dl, ul) > :nth-child(4)) { --r: 3; }
.sheet-body :deep(article :is(dl, ul) > :nth-child(5)) { --r: 4; }
.sheet-body :deep(article :is(dl, ul) > :nth-child(6)) { --r: 5; }
.sheet-body :deep(article :is(dl, ul) > :nth-child(7)) { --r: 6; }

@keyframes sheet-item {
  from {
    opacity: 0;
    transform: translateY(10px);
    filter: blur(3px);
  }
  to {
    opacity: 1;
    transform: none;
    filter: none;
  }
}

/* Leaving is one quick movement, contents and all. */
.is-closing .sheet-body {
  opacity: 0;
  transition: opacity 120ms linear;
}

.sheet-close {
  transition: color 120ms var(--ease), opacity 260ms var(--ease) 160ms;
}

.is-opening .sheet-close {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .sheet-body :deep(article > :not(dl):not(ul)),
  .sheet-body :deep(article dl > div),
  .sheet-body :deep(article ul > li) {
    animation: none;
  }
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
