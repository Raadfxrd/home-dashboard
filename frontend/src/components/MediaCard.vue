<script setup>
import AppIcon from './AppIcon.vue';

defineProps({
  item: {type: Object, required: true},
});
</script>

<template>
  <div
      class="media-card motion-fade-in overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.085]">
    <div class="relative aspect-[2/3] bg-white/5">
      <img
          v-if="item.poster"
          :alt="item.title"
          :src="item.poster"
          class="w-full h-full object-cover"
          loading="lazy"
      />
      <div v-else class="flex h-full w-full items-center justify-center text-white/30">
        <span class="glass-icon-chip h-11 w-11 rounded-2xl">
          <AppIcon :size="22" name="film"/>
        </span>
      </div>

      <div v-if="item.progress > 0" class="absolute bottom-0 left-0 right-0">
        <div class="h-[3px] bg-white/10">
          <div
              :style="{ width: `${item.progress}%` }"
              class="h-full transition-all duration-500"
              style="background: rgba(255,255,255,0.82);"
          ></div>
        </div>
      </div>
    </div>

    <div class="p-2.5">
      <div class="text-xs font-medium text-white/80 truncate leading-tight">{{ item.title }}</div>
      <div v-if="item.year" class="text-[10px] text-white/30 mt-0.5">{{ item.year }}</div>
    </div>

  </div>
</template>

<style scoped>
.media-card {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1.45rem;
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  box-shadow: none;
}
</style>

