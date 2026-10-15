import {defineStore} from 'pinia';
import {ref} from 'vue';
import {get} from '../composables/useApi.js';

export const useHomeStore = defineStore('home', () => {
	const serviceStatusRequest = ref(null);
	const systemHistory = ref(null);
	const historyRange = ref('1h');
	const serviceStatus = ref({
		prowlarr: {configured: false, online: false, statusCode: null, latencyMs: null, error: 'Not configured'},
		indexer: {configured: false, online: false, statusCode: null, latencyMs: null, error: 'Not configured'},
		downloadClient: {configured: false, online: false, statusCode: null, latencyMs: null, error: 'Not configured'},
		indexers: {configured: false, online: false, total: 0, enabled: 0, onlineCount: 0, items: []},
		downloadClients: {configured: false, online: false, total: 0, enabled: 0, onlineCount: 0, items: []},
		downloadActivity: {configured: false, online: false, total: 0, enabled: 0, onlineCount: 0, items: []},
		nasMetrics: {
			configured: false,
			online: false,
			source: null,
			label: 'NAS',
			cpu: {usagePercent: null},
			memory: {totalBytes: null, usedBytes: null, freeBytes: null, usedPercent: null},
			disk: {totalBytes: null, usedBytes: null, freeBytes: null, usedPercent: null, volumes: []},
			network: {interfaces: [], totalRxRateBytesPerSecond: null, totalTxRateBytesPerSecond: null},
			error: 'Not configured',
		},
		nasUsage: {
			configured: false,
			online: false,
			path: null,
			totalBytes: null,
			usedBytes: null,
			freeBytes: null,
			usedPercent: null
		},
	});

	async function fetchServiceStatus() {
		if (serviceStatusRequest.value) {
			return serviceStatusRequest.value;
		}

		serviceStatusRequest.value = get('/home/services-status')
			.then((payload) => {
				serviceStatus.value = {
					prowlarr: payload?.prowlarr || serviceStatus.value.prowlarr,
					indexer: payload?.indexer || serviceStatus.value.indexer,
					downloadClient: payload?.downloadClient || serviceStatus.value.downloadClient,
					indexers: payload?.indexers || serviceStatus.value.indexers,
					downloadClients: payload?.downloadClients || serviceStatus.value.downloadClients,
					downloadActivity: payload?.downloadActivity || serviceStatus.value.downloadActivity,
					nasMetrics: payload?.nasMetrics || serviceStatus.value.nasMetrics,
					nasUsage: payload?.nasUsage || serviceStatus.value.nasUsage,
				};
				return serviceStatus.value;
			})
			.catch((err) => {
				serviceStatus.value = {
					...serviceStatus.value,
					indexer: {
						...serviceStatus.value.indexer,
						online: false,
						error: err.response?.data?.error || err.message || 'Status check failed',
					},
					downloadClient: {
						...serviceStatus.value.downloadClient,
						online: false,
						error: err.response?.data?.error || err.message || 'Status check failed',
					},
					nasUsage: {
						...serviceStatus.value.nasUsage,
						online: false,
						error: err.response?.data?.error || err.message || 'Status check failed',
					},
					nasMetrics: {
						...serviceStatus.value.nasMetrics,
						online: false,
						error: err.response?.data?.error || err.message || 'Status check failed',
					},
				};
				return serviceStatus.value;
			})
			.finally(() => {
				serviceStatusRequest.value = null;
			});

		return serviceStatusRequest.value;
	}

	async function fetchSystemHistory(range = historyRange.value) {
		historyRange.value = range;
		try {
			const payload = await get('/home/system-history', {range});
			// Ignore a late answer for a range the user has already left.
			if (payload?.range === historyRange.value) systemHistory.value = payload;
		} catch {
			// Keep the last history on screen; the next poll tries again.
		}
	}

	return {
		systemHistory,
		historyRange,
		fetchSystemHistory,
		serviceStatus,
		serviceStatusRequest,
		fetchServiceStatus,
	};
});
