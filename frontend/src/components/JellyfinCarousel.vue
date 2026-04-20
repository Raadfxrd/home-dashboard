<script setup>
import MediaCard from './MediaCard.vue';

defineProps({
  title: {type: String, required: true},
  items: {type: Array, default: () => []},
  isLoading: {type: Boolean, default: false},
});
</script>

<template>
  <div>
    <p class="glass-section-label mb-4">{{ title }}</p>

    <div v-if="isLoading" class="flex gap-4 overflow-x-auto pb-2 scrollbar-hide motion-fade-in">
      <div
          v-for="i in 6"
          :key="i"
          class="flex-none w-36 glass motion-pulse-soft"
      >
        <div class="aspect-[2/3] bg-white/5"></div>
        <div class="p-2.5 space-y-1.5">
          <div class="h-2.5 bg-white/10 rounded-full"></div>
          <div class="h-2.5 w-2/3 bg-white/10 rounded-full"></div>
        </div>
      </div>
    </div>

    <div v-else-if="!items.length"
         class="glass py-6 px-5 text-white/35 text-xs tracking-wide text-center">
      Nothing to show here yet.
    </div>

    <div v-else class="flex gap-4 overflow-x-auto pb-2 scrollbar-hide motion-fade-in">
      <MediaCard v-for="item in items" :key="item.id" :item="item" class="flex-none w-36"/>
    </div>
  </div>
</template>
