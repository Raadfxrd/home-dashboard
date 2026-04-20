<script setup>
defineProps({
  item: { type: Object, required: true },
});
</script>

<template>
  <div class="bg-gray-800 rounded-xl overflow-hidden hover:scale-105 transition-transform duration-200 cursor-pointer">
    <div class="relative aspect-[2/3] bg-gray-700">
      <img
        v-if="item.poster"
        :src="item.poster"
        :alt="item.title"
        class="w-full h-full object-cover"
        loading="lazy"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-gray-500 text-4xl">
        🎬
      </div>

      <!-- Progress Bar -->
      <div v-if="item.progress > 0" class="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
        <div
          class="h-full bg-amber-500 transition-all duration-300"
          :style="{ width: `${item.progress}%` }"
        ></div>
      </div>
    </div>

    <div class="p-2">
      <div class="text-xs font-medium text-white truncate">{{ item.title }}</div>
      <div v-if="item.year" class="text-xs text-gray-500">{{ item.year }}</div>
    </div>
  </div>
</template>
