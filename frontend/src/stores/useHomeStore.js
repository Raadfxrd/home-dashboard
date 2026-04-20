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
		if (!device?.canToggle) return;
		if (device) device.state = state;
		try {
			await post('/home/toggle', {deviceId, state});
		} catch (err) {
			if (device) device.state = !state;
			console.error('Toggle failed:', err.message);
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
		} catch (err) {
			device.brightness = previousBrightness;
			device.state = previousState;
			console.error('Brightness update failed:', err.message);
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
		} catch (err) {
			device.color = previousColor;
			device.state = previousState;
			console.error('Color update failed:', err.message);
		}
	}

	return {devices, isLoading, error, fetchDevices, toggleDevice, setBrightness, setColor};
});
