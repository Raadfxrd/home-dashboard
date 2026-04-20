<script setup>
defineProps({
  item: { type: Object, required: true },
});
</script>

<template>
  <div class="glass rounded-2xl overflow-hidden cursor-pointer">

    <!-- Poster -->
    <div class="relative aspect-[2/3] bg-white/5">
      <img
        v-if="item.poster"
        :src="item.poster"
        :alt="item.title"
        class="w-full h-full object-cover"
        loading="lazy"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-white/20 text-4xl">
        🎬
      </div>

      <!-- Progress bar -->
      <div v-if="item.progress > 0" class="absolute bottom-0 left-0 right-0">
        <div class="h-[3px] bg-white/10">
          <div
            class="h-full transition-all duration-300"
            style="background: #0a84ff;"
            :style="{ width: `${item.progress}%` }"
          ></div>
        </div>
      </div>
    </div>

    <!-- Meta -->
    <div class="p-2.5">
      <div class="text-xs font-medium text-white/80 truncate leading-tight">{{ item.title }}</div>
      <div v-if="item.year" class="text-[10px] text-white/30 mt-0.5">{{ item.year }}</div>
    </div>

  </div>
</template>
