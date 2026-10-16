<script setup>
import AppIcon from './AppIcon.vue';
import {useDetailStore} from '../stores/useDetailStore.js';

/* A poster. A tap opens its details (with a link on to Jellyfin there). */
defineProps({
  item: {type: Object, required: true},
});

const detail = useDetailStore();
</script>

<template>
  <button
      type="button"
      class="media-card group block w-full min-w-0 text-left"
      data-media-card
      :aria-label="`${item.title}${item.year ? `, ${item.year}` : ''}. Show details`"
      @click="detail.open('media', item, $event)"
  >
    <div class="well relative aspect-[2/3] overflow-hidden">
      <img
          v-if="item.poster"
          :alt="item.title"
          :src="item.poster"
          class="h-full w-full object-cover transition-transform duration-500 ease-ease group-hover:scale-[1.04]"
          loading="lazy"
      />
      <span v-else class="flex h-full w-full items-center justify-center text-faint">
        <AppIcon :size="22" name="film"/>
      </span>

      <!-- Resume position, drawn on the artwork where it belongs. -->
      <span v-if="item.progress > 0" class="absolute inset-x-0 bottom-0 h-[3px] bg-black/50">
        <span class="block h-full bg-ink/90" :style="{width: `${item.progress}%`}"></span>
      </span>
    </div>

    <p class="mt-2 truncate text-[0.8125rem] leading-tight text-ink/90">{{ item.title }}</p>
    <p class="mt-0.5 truncate t-note text-[0.75rem]">
      <span v-if="item.year" class="t-read">{{ item.year }}</span>
      <span v-if="item.year && item.subtitle"> · </span>
      <span v-if="item.subtitle">{{ item.subtitle }}</span>
    </p>
  </button>
</template>
