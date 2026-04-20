import axios from 'axios';

const api = axios.create({
	baseURL: '/api',
	timeout: 10000,
});

export function get(url, params = {}) {
	return api.get(url, {params}).then((res) => res.data);
}

export function post(url, data = {}) {
	return api.post(url, data).then((res) => res.data);
}

export default api;
