import {defineStore} from 'pinia';
import {ref} from 'vue';
import {get} from '../composables/useApi.js';

export const useJellyfinStore = defineStore('jellyfin', () => {
	const suggestedWatches = ref([]);
	const recommendedShows = ref([]);
	const recentlyAdded = ref([]);
	const suggestedLoading = ref(false);
	const recommendedShowsLoading = ref(false);
	const recentLoading = ref(false);
	const suggestedError = ref(null);
	const recommendedShowsError = ref(null);
	const recentError = ref(null);

	async function fetchSuggestedWatches() {
		suggestedLoading.value = true;
		suggestedError.value = null;
		try {
			suggestedWatches.value = await get('/jellyfin/suggested');
		} catch (err) {
			suggestedError.value = err.response?.data?.error || 'Failed to load suggested watches';
		} finally {
			suggestedLoading.value = false;
		}
	}

	async function fetchRecommendedShows() {
		recommendedShowsLoading.value = true;
		recommendedShowsError.value = null;
		try {
			recommendedShows.value = await get('/jellyfin/suggested?type=shows');
		} catch (err) {
			recommendedShowsError.value = err.response?.data?.error || 'Failed to load recommended shows';
		} finally {
			recommendedShowsLoading.value = false;
		}
	}

	async function fetchRecentlyAdded() {
		recentLoading.value = true;
		recentError.value = null;
		try {
			recentlyAdded.value = await get('/jellyfin/recent');
		} catch (err) {
			recentError.value = err.response?.data?.error || 'Failed to load recently added';
		} finally {
			recentLoading.value = false;
		}
	}

	return {
		suggestedWatches,
		recommendedShows,
		recentlyAdded,
		suggestedLoading,
		recommendedShowsLoading,
		recentLoading,
		suggestedError,
		recommendedShowsError,
		recentError,
		fetchSuggestedWatches,
		fetchRecommendedShows,
		fetchRecentlyAdded,
	};
});
