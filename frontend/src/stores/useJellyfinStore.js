import {defineStore} from 'pinia';
import {ref} from 'vue';
import {get} from '../composables/useApi.js';

export const useJellyfinStore = defineStore('jellyfin', () => {
	const continueWatching = ref([]);
	const recentlyAdded = ref([]);
	const continueLoading = ref(false);
	const recentLoading = ref(false);
	const continueError = ref(null);
	const recentError = ref(null);

	async function fetchContinueWatching() {
		continueLoading.value = true;
		continueError.value = null;
		try {
			continueWatching.value = await get('/jellyfin/continue');
		} catch (err) {
			continueError.value = err.response?.data?.error || 'Failed to load continue watching';
		} finally {
			continueLoading.value = false;
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
		continueWatching,
		recentlyAdded,
		continueLoading,
		recentLoading,
		continueError,
		recentError,
		fetchContinueWatching,
		fetchRecentlyAdded,
	};
});
