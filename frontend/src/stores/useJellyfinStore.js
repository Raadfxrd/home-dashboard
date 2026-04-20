import {defineStore} from 'pinia';
import {ref} from 'vue';
import {get} from '../composables/useApi.js';

export const useJellyfinStore = defineStore('jellyfin', () => {
	const continueWatching = ref([]);
	const recentlyAdded = ref([]);
	const isLoading = ref(false);
	const error = ref(null);

	async function fetchContinueWatching() {
		isLoading.value = true;
		error.value = null;
		try {
			continueWatching.value = await get('/jellyfin/continue');
		} catch (err) {
			error.value = err.response?.data?.error || 'Failed to load continue watching';
		} finally {
			isLoading.value = false;
		}
	}

	async function fetchRecentlyAdded() {
		try {
			recentlyAdded.value = await get('/jellyfin/recent');
		} catch (err) {
			error.value = err.response?.data?.error || 'Failed to load recently added';
		}
	}

	return {continueWatching, recentlyAdded, isLoading, error, fetchContinueWatching, fetchRecentlyAdded};
});
