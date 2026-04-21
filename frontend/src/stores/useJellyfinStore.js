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
	const suggestedRequest = ref(null);
	const recommendedShowsRequest = ref(null);
	const recentRequest = ref(null);

	async function fetchSuggestedWatches() {
		if (suggestedRequest.value) return suggestedRequest.value;

		suggestedLoading.value = true;
		suggestedError.value = null;
		suggestedRequest.value = get('/jellyfin/suggested')
			.then((payload) => {
				suggestedWatches.value = payload;
				return payload;
			})
			.catch((err) => {
				suggestedError.value = err.response?.data?.error || 'Failed to load suggested watches';
				return [];
			})
			.finally(() => {
				suggestedLoading.value = false;
				suggestedRequest.value = null;
			});

		return suggestedRequest.value;
	}

	async function fetchRecommendedShows() {
		if (recommendedShowsRequest.value) return recommendedShowsRequest.value;

		recommendedShowsLoading.value = true;
		recommendedShowsError.value = null;
		recommendedShowsRequest.value = get('/jellyfin/suggested?type=shows')
			.then((payload) => {
				recommendedShows.value = payload;
				return payload;
			})
			.catch((err) => {
				recommendedShowsError.value = err.response?.data?.error || 'Failed to load recommended shows';
				return [];
			})
			.finally(() => {
				recommendedShowsLoading.value = false;
				recommendedShowsRequest.value = null;
			});

		return recommendedShowsRequest.value;
	}

	async function fetchRecentlyAdded() {
		if (recentRequest.value) return recentRequest.value;

		recentLoading.value = true;
		recentError.value = null;
		recentRequest.value = get('/jellyfin/recent')
			.then((payload) => {
				recentlyAdded.value = payload;
				return payload;
			})
			.catch((err) => {
				recentError.value = err.response?.data?.error || 'Failed to load recently added';
				return [];
			})
			.finally(() => {
				recentLoading.value = false;
				recentRequest.value = null;
			});

		return recentRequest.value;
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
		suggestedRequest,
		recommendedShowsRequest,
		recentRequest,
		fetchSuggestedWatches,
		fetchRecommendedShows,
		fetchRecentlyAdded,
	};
});
