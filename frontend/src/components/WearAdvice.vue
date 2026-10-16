<script setup>
import AppIcon from './AppIcon.vue';
import {useDetailStore} from '../stores/useDetailStore.js';

/* One line on what to wear, with its icons, for the window it's about
   ("For Dentist at 14:00"). A tap shows the reasoning. */
defineProps({
  plan: {type: Object, default: null},
});

const detail = useDetailStore();
</script>

<template>
  <button
      v-if="plan"
      type="button"
      class="wear glass press flex w-full items-center gap-4 rounded-md px-4 py-3 text-left"
      @click="detail.open('wear', plan, $event)"
  >
    <span class="flex shrink-0 -space-x-1.5">
      <span
          v-for="item in plan.outfit.items.slice(0, 3)"
          :key="item.key"
          class="flex h-8 w-8 items-center justify-center rounded-full bg-line-soft text-ink ring-2 ring-[rgb(40_40_44)]"
      >
        <AppIcon :size="16" :name="item.icon"/>
      </span>
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-[0.9375rem] font-semibold text-ink">{{ plan.outfit.headline }}</span>
      <span class="block truncate t-note text-[0.75rem]">{{ plan.label }}</span>
    </span>
    <AppIcon :size="15" class="shrink-0 text-faint" name="arrow"/>
  </button>
</template>

<style scoped>
.wear {
  transition: background-color 120ms var(--ease);
}

.wear:hover {
  background: var(--glass-fill-hover);
}

.wear:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
