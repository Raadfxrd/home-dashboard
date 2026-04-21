import axios from 'axios';

const API_TIMEOUT_MS = Math.max(5000, Math.min(120000, Number(import.meta.env.VITE_API_TIMEOUT_MS || 20000)));

const api = axios.create({
	baseURL: '/api',
	timeout: API_TIMEOUT_MS,
});

export function get(url, params = {}) {
	return api.get(url, {params}).then((res) => res.data);
}

export function post(url, data = {}) {
	return api.post(url, data).then((res) => res.data);
}

export default api;
