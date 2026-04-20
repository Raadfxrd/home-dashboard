<script setup>
import MediaCard from './MediaCard.vue';

defineProps({
  title: { type: String, required: true },
  items: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
});
</script>

<template>
  <div>
    <h2 class="text-lg font-semibold text-gray-400 uppercase tracking-wider mb-4">{{ title }}</h2>

    <!-- Loading Skeleton -->
    <div v-if="isLoading" class="flex gap-4 overflow-x-auto pb-2">
      <div
        v-for="i in 6"
        :key="i"
        class="flex-none w-36 bg-gray-800 rounded-xl animate-pulse"
      >
        <div class="aspect-[2/3] bg-gray-700 rounded-t-xl"></div>
        <div class="p-2 space-y-1">
          <div class="h-3 bg-gray-700 rounded"></div>
          <div class="h-3 w-2/3 bg-gray-700 rounded"></div>
        </div>
      </div>
    </div>

    <!-- No Items -->
    <div v-else-if="!items.length" class="text-gray-500 text-sm py-4">
      Nothing to show here yet.
    </div>

    <!-- Carousel -->
    <div v-else class="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
      <MediaCard v-for="item in items" :key="item.id" :item="item" class="flex-none w-36" />
    </div>
  </div>
</template>
