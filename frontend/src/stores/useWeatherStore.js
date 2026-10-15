import {defineStore} from 'pinia';
import {ref} from 'vue';
import {get} from '../composables/useApi.js';

export const useWeatherStore = defineStore('weather', () => {
	const amsterdamWeather = ref(null);
	const locationWeather = ref(null);
	const outlook = ref(null);
	const isLoading = ref(false);
	const error = ref(null);

	async function fetchAmsterdamWeather() {
		isLoading.value = true;
		error.value = null;
		try {
			amsterdamWeather.value = await get('/weather', {city: 'Amsterdam'});
		} catch (err) {
			error.value = err.response?.data?.error || 'Failed to load Amsterdam weather';
		} finally {
			isLoading.value = false;
		}
	}

	async function fetchLocationWeather(lat, lon) {
		try {
			locationWeather.value = await get('/weather/current', {lat, lon});
		} catch (err) {
			error.value = err.response?.data?.error || 'Failed to load location weather';
		}
	}

	/* The next 12 hours and the rain over the next 2. Failing quietly is
	   fine here: the current reading still shows without it. */
	async function fetchOutlook(city = 'Amsterdam') {
		try {
			outlook.value = await get('/weather/outlook', {city});
		} catch {
			outlook.value = null;
		}
	}

	return {
		amsterdamWeather,
		locationWeather,
		outlook,
		isLoading,
		error,
		fetchAmsterdamWeather,
		fetchLocationWeather,
		fetchOutlook,
	};
});
