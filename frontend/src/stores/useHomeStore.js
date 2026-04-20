import {defineStore} from 'pinia';
import {ref} from 'vue';
import {get, post} from '../composables/useApi.js';

export const useHomeStore = defineStore('home', () => {
	const devices = ref({});
	const isLoading = ref(false);
	const error = ref(null);

	async function fetchDevices() {
		isLoading.value = true;
		error.value = null;
		try {
			devices.value = await get('/home/devices');
		} catch (err) {
			error.value = err.response?.data?.error || 'Failed to load devices';
		} finally {
			isLoading.value = false;
		}
	}

	function findDevice(deviceId) {
		for (const room of Object.values(devices.value)) {
			const device = room.find((d) => d.id === deviceId);
			if (device) return device;
		}
		return null;
	}

	async function toggleDevice(deviceId, state) {
		const device = findDevice(deviceId);
		if (device) device.state = state;
		try {
			await post('/home/toggle', {deviceId, state});
		} catch (err) {
			if (device) device.state = !state;
			console.error('Toggle failed:', err.message);
		}
	}

	return {devices, isLoading, error, fetchDevices, toggleDevice};
});
