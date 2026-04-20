<script setup>
import {computed, onMounted, ref, watch} from 'vue';
import {RouterLink, useRoute} from 'vue-router';
import MediaCard from '../components/MediaCard.vue';
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
const pageTitle = computed(() => (kind.value === 'shows' ? 'All Shows' : 'All Movies'));

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
    error.value = err.response?.data?.error || 'Failed to load library';
  } finally {
    isLoading.value = false;
    isLoadingMore.value = false;
  }
}

function loadMore() {
  if (isLoadingMore.value || !hasMore.value) return;
  fetchPage(items.value.length, true);
}

function refreshList() {
  fetchPage(0, false);
}

watch(
    () => route.params.kind,
    () => {
      fetchPage(0, false);
    }
);

onMounted(() => {
  fetchPage(0, false);
});
</script>

<template>
  <div class="relative min-h-screen text-white">
    <main class="mx-auto max-w-screen-xl space-y-6 px-4 pb-10 pt-8 md:px-6">
      <header class="glass flex items-center justify-between px-4 py-3">
        <div>
          <p class="glass-section-label">Media Library</p>
          <h1 class="mt-1 text-xl font-semibold tracking-tight">{{ pageTitle }}</h1>
          <p class="mt-1 text-xs text-white/45">{{ total }} items</p>
        </div>
        <RouterLink
            class="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/[0.09]"
            to="/">
          Back
        </RouterLink>
      </header>

      <div class="flex gap-2">
        <RouterLink
            :class="kind === 'movies' ? 'bg-white/14 text-white' : 'bg-white/5 text-white/70'"
            class="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/[0.12]"
            to="/media/movies"
        >
          Movies
        </RouterLink>
        <RouterLink
            :class="kind === 'shows' ? 'bg-white/14 text-white' : 'bg-white/5 text-white/70'"
            class="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/[0.12]"
            to="/media/shows"
        >
          Shows
        </RouterLink>
      </div>

      <div class="glass flex flex-wrap items-center gap-3 px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="text-[10px] uppercase tracking-[0.16em] text-white/45">Sort by</span>
          <select
              v-model="sortBy"
              class="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 outline-none hover:bg-white/[0.09]"
              @change="refreshList"
          >
            <option value="title">Title</option>
            <option value="year">Year</option>
            <option value="added">Recently Added</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[10px] uppercase tracking-[0.16em] text-white/45">Order</span>
          <select
              v-model="sortOrder"
              class="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 outline-none hover:bg-white/[0.09]"
              @change="refreshList"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      <div v-if="isLoading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        <div v-for="i in 12" :key="i"
             class="rounded-[1.45rem] border border-white/10 bg-white/[0.05] motion-pulse-soft">
          <div class="aspect-[2/3] bg-white/5"></div>
          <div class="p-2.5 space-y-1.5">
            <div class="h-2.5 rounded-full bg-white/10"></div>
            <div class="h-2.5 w-2/3 rounded-full bg-white/10"></div>
          </div>
        </div>
      </div>

      <div v-else-if="error" class="glass px-5 py-6 text-center text-xs tracking-wide text-red-300/80">
        {{ error }}
      </div>

      <div v-else-if="!items.length" class="glass px-5 py-6 text-center text-xs tracking-wide text-white/35">
        Nothing to show here yet.
      </div>

      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        <MediaCard v-for="item in items" :key="item.id" :item="item"/>
      </div>

      <div v-if="hasMore" class="flex justify-center">
        <button
            :disabled="isLoadingMore"
            class="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/75 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            @click="loadMore"
        >
          {{ isLoadingMore ? 'Loading...' : 'Load more' }}
        </button>
      </div>
    </main>
  </div>
</template>

