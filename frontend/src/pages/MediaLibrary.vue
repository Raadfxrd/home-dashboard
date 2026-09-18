<script setup>
import {computed, onMounted, ref, watch} from 'vue';
import {RouterLink, useRoute} from 'vue-router';
import MediaCard from '../components/MediaCard.vue';
import AppIcon from '../components/AppIcon.vue';
import {get} from '../composables/useApi.js';

const route = useRoute();

const items = ref([]);
const isLoading = ref(false);
const isLoadingMore = ref(false);
const error = ref(null);
const hasMore = ref(false);
const total = ref(0);
const sortBy = ref('title');
const sortOrder = ref('asc');

const kind = computed(() => (route.params.kind === 'shows' ? 'shows' : 'movies'));

async function fetchPage(startIndex = 0, append = false) {
  if (append) {
    isLoadingMore.value = true;
  } else {
    isLoading.value = true;
    error.value = null;
  }

  try {
    const response = await get('/jellyfin/library', {
      type: kind.value,
      startIndex,
      limit: 48,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
    });

    const nextItems = response?.items || [];
    items.value = append ? [...items.value, ...nextItems] : nextItems;
    hasMore.value = Boolean(response?.hasMore);
    total.value = Number(response?.total || items.value.length);
  } catch (err) {
    error.value = err.response?.data?.error || 'Could not reach the library. Check that Jellyfin is running.';
  } finally {
    isLoading.value = false;
    isLoadingMore.value = false;
  }
}

function loadMore() {
  if (isLoadingMore.value || !hasMore.value) return;
  fetchPage(items.value.length, true);
}

watch(() => route.params.kind, () => fetchPage(0, false));
onMounted(() => fetchPage(0, false));
</script>

<template>
  <div class="relative z-10 flex min-h-dvh flex-col">
    <header class="chrome sticky top-0 z-30 border-b border-line-soft">
      <div class="mx-auto flex max-w-[1560px] items-center justify-between gap-4 px-5 py-3 md:px-9">
        <RouterLink class="link-quiet press flex items-center gap-1.5 text-[0.875rem]" to="/">
          <AppIcon :size="15" name="back"/>
          Home
        </RouterLink>
        <span class="t-note t-read">{{ total || items.length }} titles</span>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[1560px] flex-1 px-5 pb-16 pt-8 md:px-9">
      <div class="settle mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 class="text-[2.6rem] font-semibold leading-none tracking-[-0.035em] text-ink">Library</h1>
          <!-- Movies and shows are the same library seen two ways, so they read
               as a switch rather than as two destinations. -->
          <div class="mt-5 flex gap-1">
            <RouterLink
                v-for="tab in [{to: '/media/movies', label: 'Films', key: 'movies'}, {to: '/media/shows', label: 'Shows', key: 'shows'}]"
                :key="tab.key"
                :to="tab.to"
                :class="kind === tab.key ? 'bg-raised text-ink' : 'text-dim hover:text-ink'"
                class="press rounded-md px-3.5 py-1.5 text-[0.875rem] transition-colors duration-200"
            >
              {{ tab.label }}
            </RouterLink>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <label class="sr-only" for="sort-by">Sort by</label>
          <select
              id="sort-by"
              v-model="sortBy"
              class="panel press cursor-pointer px-3 py-2 text-[0.8125rem] text-dim outline-none hover:text-ink"
              @change="fetchPage(0, false)"
          >
            <option value="title">Title</option>
            <option value="year">Year</option>
            <option value="added">Recently added</option>
          </select>

          <label class="sr-only" for="sort-order">Order</label>
          <select
              id="sort-order"
              v-model="sortOrder"
              class="panel press cursor-pointer px-3 py-2 text-[0.8125rem] text-dim outline-none hover:text-ink"
              @change="fetchPage(0, false)"
          >
            <option value="asc">A–Z</option>
            <option value="desc">Z–A</option>
          </select>
        </div>
      </div>

      <div v-if="isLoading" class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-7">
        <div v-for="i in 14" :key="i">
          <div class="well aspect-[2/3] animate-pulse"></div>
          <div class="mt-2 h-3 w-4/5 animate-pulse rounded bg-line-soft"></div>
        </div>
      </div>

      <p v-else-if="error" class="panel flex items-center gap-2.5 p-5 t-body text-ink">
        <span class="dot dot-fault"></span>{{ error }}
      </p>

      <p v-else-if="!items.length" class="panel p-5 t-note">
        Nothing in here yet. Anything you add to Jellyfin will show up on this page.
      </p>

      <div v-else class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-7">
        <MediaCard v-for="item in items" :key="item.id" :item="item"/>
      </div>

      <div v-if="hasMore" class="mt-10 flex justify-center">
        <button
            :disabled="isLoadingMore"
            class="panel press px-5 py-2.5 text-[0.875rem] text-dim hover:text-ink disabled:opacity-50"
            type="button"
            @click="loadMore"
        >
          {{ isLoadingMore ? 'Loading' : 'Show more' }}
        </button>
      </div>
    </main>
  </div>
</template>
