<script setup>
import {nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
import MediaCard from './MediaCard.vue';

const props = defineProps({
  title: {type: String, required: true},
  items: {type: Array, default: () => []},
  isLoading: {type: Boolean, default: false},
  error: {type: String, default: null},
});

const carouselRef = ref(null);
const showRightFade = ref(false);
let wheelFrameId = 0;
let wheelAccumulated = 0;
const wheelThreshold = 24;

function updateRightFade() {
  const el = carouselRef.value;
  if (!el) {
    showRightFade.value = false;
    return;
  }

  const hasOverflow = el.scrollWidth - el.clientWidth > 4;
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
  showRightFade.value = hasOverflow && !atEnd;
}

function onWheelScroll(event) {
  const el = carouselRef.value;
  if (!el) return;

  if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    wheelAccumulated += event.deltaY;

    if (!wheelFrameId) {
      wheelFrameId = window.requestAnimationFrame(() => {
        const target = carouselRef.value;
        if (target && Math.abs(wheelAccumulated) >= wheelThreshold) {
          const card = target.querySelector('[data-media-card]');
          const itemWidth = card ? card.clientWidth : 144;
          const step = Math.round((itemWidth + 16) * 1.02);
          const direction = wheelAccumulated > 0 ? 1 : -1;
          target.scrollBy({left: direction * step, behavior: 'smooth'});
          wheelAccumulated = 0;
          updateRightFade();
        }
        wheelFrameId = 0;
      });
    }

    if (el.scrollWidth > el.clientWidth) {
      event.preventDefault();
    }
  }
}

watch(
    () => [props.items.length, props.isLoading, props.error],
    async () => {
      await nextTick();
      updateRightFade();
    },
    {immediate: true}
);

onMounted(() => {
  window.addEventListener('resize', updateRightFade);
  updateRightFade();
});

onUnmounted(() => {
  window.removeEventListener('resize', updateRightFade);
  if (wheelFrameId) {
    window.cancelAnimationFrame(wheelFrameId);
  }
});
</script>

<template>
  <div>
    <p class="glass-section-label mb-4">{{ title }}</p>

    <div v-if="isLoading" class="relative">
      <div class="flex gap-4 overflow-x-auto pb-2 motion-fade-in snap-x snap-mandatory">
        <div
            v-for="i in 8"
            :key="i"
            class="flex-none w-36 rounded-[1.45rem] border border-white/10 bg-white/[0.05] motion-pulse-soft snap-start"
        >
          <div class="aspect-[2/3] bg-white/5"></div>
          <div class="p-2.5 space-y-1.5">
            <div class="h-2.5 bg-white/10 rounded-full"></div>
            <div class="h-2.5 w-2/3 bg-white/10 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="error"
         class="glass py-6 px-5 text-red-300/80 text-xs tracking-wide text-center">
      {{ error }}
    </div>

    <div v-else-if="!items.length"
         class="glass py-6 px-5 text-white/35 text-xs tracking-wide text-center">
      Nothing to show here yet.
    </div>

    <div v-else class="relative">
      <div
          ref="carouselRef"
          class="flex gap-4 overflow-x-auto pb-2 motion-fade-in snap-x snap-mandatory"
          @scroll="updateRightFade"
          @wheel="onWheelScroll"
      >
        <MediaCard
            v-for="item in items"
            :key="item.id"
            :item="item"
            class="flex-none w-36 snap-start"
        />
      </div>
      <div
          v-if="showRightFade"
          class="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#0b0b0c] to-transparent"
      />
    </div>

  </div>
</template>
