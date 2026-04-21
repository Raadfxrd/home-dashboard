import {defineStore} from 'pinia';
import {ref} from 'vue';
import {get, post} from '../composables/useApi.js';

export const useHomeStore = defineStore('home', () => {
	const devices = ref([]);
	const isLoading = ref(false);
	const error = ref(null);
	const notifications = ref([]);
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

	function notify(type, message) {
		const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
		notifications.value.push({id, type, message});
		setTimeout(() => {
			notifications.value = notifications.value.filter((item) => item.id !== id);
		}, 2800);
	}

	async function fetchDevices() {
		isLoading.value = true;
		error.value = null;
		try {
			const payload = await get('/home/devices');
			devices.value = Array.isArray(payload) ? payload : Object.values(payload || {}).flat();
		} catch (err) {
			error.value = err.response?.data?.error || 'Failed to load devices';
			notify('error', error.value);
		} finally {
			isLoading.value = false;
		}
	}

	function findDevice(deviceId) {
		return devices.value.find((device) => device.id === deviceId) || null;
	}

	async function toggleDevice(deviceId, state) {
		const device = findDevice(deviceId);
		if (!device?.canToggle) return;
		if (device) device.state = state;
		try {
			await post('/home/toggle', {deviceId, state});
			notify('success', `${device.name}: ${state ? 'On' : 'Off'}`);
		} catch (err) {
			if (device) device.state = !state;
			console.error('Toggle failed:', err.message);
			notify('error', err.response?.data?.error || `Failed to toggle ${device.name}`);
		}
	}

	async function setBrightness(deviceId, brightness) {
		const device = findDevice(deviceId);
		if (!device?.supportsBrightness) return;

		const previousBrightness = device.brightness;
		const previousState = device.state;
		const normalized = Math.max(0, Math.min(100, Math.round(Number(brightness))));

		device.brightness = normalized;
		if (normalized > 0) {
			device.state = true;
		}

		try {
			await post('/home/brightness', {deviceId, brightness: normalized});
			notify('success', `${device.name}: Brightness ${normalized}%`);
		} catch (err) {
			device.brightness = previousBrightness;
			device.state = previousState;
			console.error('Brightness update failed:', err.message);
			notify('error', err.response?.data?.error || `Failed to set brightness for ${device.name}`);
		}
	}

	async function setColor(deviceId, color) {
		const device = findDevice(deviceId);
		if (!device?.supportsColor) return;

		const previousColor = device.color;
		const previousState = device.state;
		device.color = color;
		device.state = true;

		try {
			const response = await post('/home/color', {deviceId, color});
			if (response?.color) {
				device.color = response.color;
			}
			if (typeof response?.hue === 'number') {
				device.hue = response.hue;
			}
			if (typeof response?.saturation === 'number') {
				device.saturation = response.saturation;
			}
			notify('success', `${device.name}: Color updated`);
		} catch (err) {
			device.color = previousColor;
			device.state = previousState;
			console.error('Color update failed:', err.message);
			notify('error', err.response?.data?.error || `Failed to set color for ${device.name}`);
		}
	}

	async function fetchServiceStatus() {
		try {
			const payload = await get('/home/services-status');
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
		} catch (err) {
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
		}
	}

	return {
		devices,
		isLoading,
		error,
		notifications,
		serviceStatus,
		fetchDevices,
		toggleDevice,
		setBrightness,
		setColor,
		fetchServiceStatus,
	};
});
