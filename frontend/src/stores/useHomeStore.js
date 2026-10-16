import {defineStore} from 'pinia';
import {ref} from 'vue';
import {get, post} from '../composables/useApi.js';

export const useHomeStore = defineStore('home', () => {
	const serviceStatusRequest = ref(null);
	const systemHistory = ref(null);
	// False until the first status answer (or failure) arrives, so the page
	// shows placeholders instead of "not configured" on load.
	const statusLoaded = ref(false);
	const containers = ref({configured: false, online: false, total: 0, running: 0, items: [], error: null});
	const logEntries = ref([]);
	const logClearedAt = ref(0);
	const upcoming = ref(null);
	const calendar = ref(null);
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
				statusLoaded.value = true;
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

	async function fetchContainers() {
		try {
			containers.value = await get('/containers');
		} catch (err) {
			containers.value = {...containers.value, online: false, error: err.message};
		}
	}

	async function fetchLog() {
		try {
			const payload = await get('/logs');
			logEntries.value = payload?.entries || [];
			logClearedAt.value = payload?.clearedAt || 0;
		} catch {
			// The log itself failing to load isn't worth a log line.
		}
	}

	async function clearLog() {
		const previous = logEntries.value;
		logEntries.value = [];
		try {
			await post('/logs/clear');
		} catch {
			logEntries.value = previous;
		}
	}

	async function fetchCalendar() {
		try {
			calendar.value = await get('/calendar');
		} catch {
			calendar.value = calendar.value || {configured: false, events: []};
		}
	}

	async function fetchUpcoming() {
		try {
			upcoming.value = await get('/upcoming');
		} catch {
			upcoming.value = upcoming.value || {configured: {sonarr: false, radarr: false}, items: [], failed: []};
		}
	}

	return {
		containers,
		logEntries,
		logClearedAt,
		upcoming,
		calendar,
		fetchCalendar,
		fetchContainers,
		fetchLog,
		clearLog,
		fetchUpcoming,
		statusLoaded,
		systemHistory,
		historyRange,
		fetchSystemHistory,
		serviceStatus,
		serviceStatusRequest,
		fetchServiceStatus,
	};
});
