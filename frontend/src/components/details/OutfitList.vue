<script setup>
import AppIcon from '../AppIcon.vue';

/* The clothing suggestions as a short list with icons. */
defineProps({
  outfit: {type: Object, default: null},
});
</script>

<template>
  <ul v-if="outfit" class="flex flex-col gap-2">
    <li v-for="item in outfit.items" :key="item.key" class="flex items-center gap-3">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line-soft text-ink">
        <AppIcon :size="18" :name="item.icon"/>
      </span>
      <span class="text-[0.9375rem] text-ink">{{ item.label }}</span>
    </li>
  </ul>
</template>
