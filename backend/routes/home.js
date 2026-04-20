const express = require('express');
const axios = require('axios');
const fs = require('fs');

const router = express.Router();

const HOMEBRIDGE_URL = process.env.HOMEBRIDGE_URL || 'http://localhost:8581';
const HB_USERNAME = process.env.HOMEBRIDGE_USERNAME || 'admin';
const HB_PASSWORD = process.env.HOMEBRIDGE_PASSWORD || 'admin';
const INDEXER_URL = process.env.INDEXER_URL || '';
const INDEXER_API_KEY = process.env.INDEXER_API_KEY || '';
const INDEXER_STATUS_PATH = process.env.INDEXER_STATUS_PATH || '/';
const QBITTORRENT_URL = process.env.QBITTORRENT_URL || '';
const QBITTORRENT_USERNAME = process.env.QBITTORRENT_USERNAME || '';
const QBITTORRENT_PASSWORD = process.env.QBITTORRENT_PASSWORD || '';
const QBITTORRENT_STATUS_PATH = process.env.QBITTORRENT_STATUS_PATH || '/api/v2/app/version';
const NZBGET_URL = process.env.NZBGET_URL || '';
const NZBGET_USERNAME = process.env.NZBGET_USERNAME || '';
const NZBGET_PASSWORD = process.env.NZBGET_PASSWORD || '';
const NZBGET_STATUS_PATH = process.env.NZBGET_STATUS_PATH || '/jsonrpc';
const NAS_USAGE_PATH = process.env.NAS_USAGE_PATH || '';
const NAS_USAGE_LABEL = process.env.NAS_USAGE_LABEL || 'NAS';

let homebridgeToken = null;
let tokenExpiry = 0;
let tokenPromise = null;
const deviceWriteQueues = new Map();
const lastCharacteristicValues = new Map();

function logHomebridge(event, details = {}) {
	console.log('[Homebridge]', event, details);
}

function getErrorDetails(err) {
	return {
		message: err.message,
		status: err.response?.status || null,
		code: err.code || null,
	};
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function toBoolean(value) {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value > 0;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
	}
	return Boolean(value);
}

function normalizeRoomName(roomName) {
	const raw = String(roomName || '').trim();
	if (!raw) return 'Other';
	if (raw.toLowerCase() === 'other') return 'Other';
	return raw
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function enqueueDeviceWrite(deviceId, task) {
	const previous = deviceWriteQueues.get(deviceId) || Promise.resolve();
	const next = previous.catch(() => {
	}).then(task);
	deviceWriteQueues.set(deviceId, next);

	return next.finally(() => {
		if (deviceWriteQueues.get(deviceId) === next) {
			deviceWriteQueues.delete(deviceId);
		}
	});
}

function hueSatToHex(hue, saturation) {
	const h = ((Number(hue) % 360) + 360) % 360;
	const s = clamp(Number(saturation) / 100, 0, 1);
	const v = 1;
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;

	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}

	const toHex = (channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function parseHexColor(hex) {
	if (typeof hex !== 'string' || !/^#?[0-9a-fA-F]{6}$/.test(hex)) {
		return null;
	}
	const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
	return {
		r: parseInt(normalized.slice(0, 2), 16),
		g: parseInt(normalized.slice(2, 4), 16),
		b: parseInt(normalized.slice(4, 6), 16),
	};
}

function rgbToHueSat({r, g, b}) {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const delta = max - min;

	let hue = 0;
	if (delta !== 0) {
		if (max === rn) {
			hue = 60 * (((gn - bn) / delta) % 6);
		} else if (max === gn) {
			hue = 60 * ((bn - rn) / delta + 2);
		} else {
			hue = 60 * ((rn - gn) / delta + 4);
		}
	}
	if (hue < 0) {
		hue += 360;
	}

	const saturation = max === 0 ? 0 : (delta / max) * 100;
	return {
		hue: Math.round(hue),
		saturation: Math.round(saturation),
	};
}

async function getToken() {
	if (homebridgeToken && Date.now() < tokenExpiry) return homebridgeToken;
	if (tokenPromise) return tokenPromise;

	logHomebridge('auth.login_start', {url: HOMEBRIDGE_URL});

	tokenPromise = axios
		.post(
			`${HOMEBRIDGE_URL}/api/auth/login`,
			{username: HB_USERNAME, password: HB_PASSWORD},
			{timeout: 5000}
		)
		.then((res) => {
			homebridgeToken = res.data.access_token;
			tokenExpiry = Date.now() + (res.data.expires_in || 3600) * 1000 - 60000;
			logHomebridge('auth.login_success', {expiresInSeconds: res.data.expires_in || 3600});
			return homebridgeToken;
		})
		.catch((err) => {
			logHomebridge('auth.login_error', getErrorDetails(err));
			throw err;
		})
		.finally(() => {
			tokenPromise = null;
		});

	return tokenPromise;
}

const DEVICE_ID_PATTERN = /^[^/?#]+$/;

function resolveRoomName(acc) {
	return normalizeRoomName(
		acc.room?.name ||
		acc.roomName ||
		acc.context?.roomName ||
		acc.context?.room ||
		'Other'
	);
}


function isHiddenAccessory(acc) {
	const hiddenChar = acc.serviceCharacteristics?.find((c) => c.type === 'Hidden');
	return Boolean(
		toBoolean(acc.hidden) ||
		toBoolean(acc.isHidden) ||
		acc.visibility === 'hidden' ||
		toBoolean(hiddenChar?.value)
	);
}

function classifyAccessory(acc) {
	const source = `${acc.type || ''} ${acc.serviceName || ''}`.toLowerCase();
	if (source.includes('bridge')) return 'bridge';
	if (source.includes('remote')) return 'remote';
	if (source.includes('light')) return 'light';
	if (source.includes('switch') || source.includes('outlet')) return 'switch';
	if (source.includes('fan')) return 'fan';
	if (source.includes('thermostat')) return 'thermostat';
	if (source.includes('lock')) return 'lock';
	return 'sensor';
}

function buildServiceUrl(baseUrl, statusPath) {
	const base = String(baseUrl || '').trim().replace(/\/+$/, '');
	if (!base) return null;

	const rawPath = String(statusPath || '/').trim();
	if (!rawPath) return base;
	if (/^https?:\/\//i.test(rawPath)) return rawPath;
	const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
	return `${base}${normalizedPath}`;
}

async function probeService(name, {baseUrl, statusPath, apiKey}) {
	const targetUrl = buildServiceUrl(baseUrl, statusPath);
	if (!targetUrl) {
		return {
			name,
			configured: false,
			online: false,
			statusCode: null,
			latencyMs: null,
			error: 'Not configured',
		};
	}

	const headers = {};
	if (apiKey) {
		headers['X-Api-Key'] = apiKey;
		headers['x-api-key'] = apiKey;
	}

	const startedAt = Date.now();
	try {
		const response = await axios.get(targetUrl, {
			headers,
			timeout: 5000,
			validateStatus: () => true,
		});
		const online = response.status >= 200 && response.status < 400;

		return {
			name,
			configured: true,
			online,
			statusCode: response.status,
			latencyMs: Date.now() - startedAt,
			error: online ? null : `HTTP ${response.status}`,
		};
	} catch (err) {
		return {
			name,
			configured: true,
			online: false,
			statusCode: err.response?.status || null,
			latencyMs: Date.now() - startedAt,
			error: err.message,
		};
	}
}

function buildSummary(items = [], configured = false, online = false) {
	const total = items.length;
	const enabled = items.filter((item) => item.enabled !== false).length;
	const onlineCount = items.filter((item) => item.online !== false).length;
	return {
		configured,
		online,
		total,
		enabled,
		onlineCount,
		items,
	};
}

function toNumber(value, fallback = 0) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function formatBytes(bytes) {
	const value = toNumber(bytes, 0);
	if (!Number.isFinite(value) || value < 0) return '0 B';
	if (value < 1024) return `${Math.round(value)} B`;
	const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
	let current = value / 1024;
	let unitIndex = 0;
	while (current >= 1024 && unitIndex < units.length - 1) {
		current /= 1024;
		unitIndex += 1;
	}
	return `${current >= 10 ? current.toFixed(0) : current.toFixed(1)} ${units[unitIndex]}`;
}

function buildNasSummary(path, stats) {
	const totalBytes = Number(stats.bsize) * Number(stats.blocks);
	const freeBytes = Number(stats.bsize) * Number(stats.bavail);
	const usedBytes = Math.max(totalBytes - freeBytes, 0);
	const usedPercent = totalBytes > 0 ? Math.min(100, Math.max(0, Math.round((usedBytes / totalBytes) * 100))) : 0;

	return {
		configured: true,
		online: true,
		label: NAS_USAGE_LABEL,
		path,
		totalBytes,
		usedBytes,
		freeBytes,
		usedPercent,
		formattedTotal: formatBytes(totalBytes),
		formattedUsed: formatBytes(usedBytes),
		formattedFree: formatBytes(freeBytes),
	};
}

function mapQbittorrentDownload(torrent) {
	const progress = clamp(Math.round(toNumber(torrent.progress, 0) * 100), 0, 100);
	return {
		id: torrent.hash || torrent.name,
		name: torrent.name || 'Unnamed download',
		progress,
		sizeBytes: toNumber(torrent.size, 0),
		downloadedBytes: toNumber(torrent.downloaded, 0),
		remainingBytes: toNumber(torrent.amount_left, 0),
		speedBytesPerSecond: toNumber(torrent.dlspeed, 0),
		etaSeconds: Number.isFinite(Number(torrent.eta)) ? Number(torrent.eta) : null,
		state: torrent.state || 'unknown',
		category: torrent.category || torrent.tags || null,
	};
}

function mapNzbgetDownload(group) {
	const totalBytes = toNumber(group.FileSizeMB ?? group.fileSizeMB ?? group.SizeMB ?? group.sizeMB, 0) * 1024 * 1024;
	const downloadedBytes = toNumber(group.DownloadedSizeMB ?? group.downloadedSizeMB ?? group.CompletedSizeMB ?? group.completedSizeMB, 0) * 1024 * 1024;
	const remainingBytes = toNumber(group.RemainingSizeMB ?? group.remainingSizeMB, Math.max(totalBytes - downloadedBytes, 0)) * 1024 * 1024;
	const progress = totalBytes > 0 ? Math.min(100, Math.max(0, Math.round((downloadedBytes / totalBytes) * 100))) : 0;
	const activeDownloads = toNumber(group.ActiveDownloads ?? group.activeDownloads, 0);
	const speedBytesPerSecond = toNumber(group.DLRate ?? group.downloadRate ?? group.Speed ?? group.speed, 0) * 1024;
	const etaSeconds = toNumber(group.RemainingSec ?? group.remainingSec ?? group.eta ?? group.ETA, null);

	return {
		id: group.NZBID || group.id || group.NzbId || group.name,
		name: group.NZBName || group.nzbName || group.Name || group.name || 'Unnamed download',
		progress,
		sizeBytes: totalBytes,
		downloadedBytes,
		remainingBytes,
		speedBytesPerSecond,
		etaSeconds: Number.isFinite(Number(etaSeconds)) ? Number(etaSeconds) : null,
		state: group.Status || group.status || 'unknown',
		category: group.Category || group.category || null,
		activeDownloads,
	};
}

async function getQbittorrentCookie() {
	const loginUrl = buildServiceUrl(QBITTORRENT_URL, '/api/v2/auth/login');
	if (!loginUrl) return null;
	if (!QBITTORRENT_USERNAME || !QBITTORRENT_PASSWORD) {
		throw new Error('Missing credentials');
	}

	const loginBody = new URLSearchParams({
		username: QBITTORRENT_USERNAME,
		password: QBITTORRENT_PASSWORD,
	});

	const loginResponse = await axios.post(loginUrl, loginBody.toString(), {
		headers: {'Content-Type': 'application/x-www-form-urlencoded'},
		timeout: 5000,
		validateStatus: () => true,
	});

	if (loginResponse.status < 200 || loginResponse.status >= 400) {
		throw new Error(`Login HTTP ${loginResponse.status}`);
	}

	const cookie = (loginResponse.headers['set-cookie'] || []).map((value) => value.split(';')[0]).join('; ');
	if (!cookie) {
		throw new Error('Missing session cookie');
	}

	return cookie;
}

async function getNzbgetRpcResult(method, params = []) {
	const targetUrl = buildServiceUrl(NZBGET_URL, NZBGET_STATUS_PATH);
	if (!targetUrl) return {configured: false, online: false, result: null, error: 'Not configured'};
	if (!NZBGET_USERNAME || !NZBGET_PASSWORD) return {
		configured: false,
		online: false,
		result: null,
		error: 'Missing credentials'
	};

	const response = await axios.post(
		targetUrl,
		{method, params, id: 'home-dashboard', jsonrpc: '2.0'},
		{
			auth: {username: NZBGET_USERNAME, password: NZBGET_PASSWORD},
			timeout: 5000,
			validateStatus: () => true,
		}
	);

	if (response.status < 200 || response.status >= 400) {
		throw new Error(`HTTP ${response.status}`);
	}

	if (response.data?.error) {
		throw new Error(response.data.error.message || 'NZBGet RPC error');
	}

	return {configured: true, online: true, result: response.data?.result ?? null, error: null};
}

async function fetchQbittorrentDownloads() {
	const targetUrl = buildServiceUrl(QBITTORRENT_URL, '/api/v2/torrents/info');
	if (!targetUrl) {
		return {name: 'qbittorrent', configured: false, online: false, downloads: [], error: 'Not configured'};
	}
	if (!QBITTORRENT_USERNAME || !QBITTORRENT_PASSWORD) {
		return {name: 'qbittorrent', configured: false, online: false, downloads: [], error: 'Missing credentials'};
	}

	const startedAt = Date.now();
	try {
		const cookie = await getQbittorrentCookie();
		const response = await axios.get(targetUrl, {
			headers: cookie ? {Cookie: cookie} : {},
			params: {filter: 'downloading'},
			timeout: 5000,
			validateStatus: () => true,
		});

		if (response.status < 200 || response.status >= 400 || !Array.isArray(response.data)) {
			return {
				name: 'qbittorrent',
				configured: true,
				online: false,
				statusCode: response.status,
				latencyMs: Date.now() - startedAt,
				downloads: [],
				error: `HTTP ${response.status}`,
			};
		}

		return {
			name: 'qbittorrent',
			configured: true,
			online: true,
			statusCode: response.status,
			latencyMs: Date.now() - startedAt,
			downloads: response.data.map(mapQbittorrentDownload).slice(0, 5),
			error: null,
		};
	} catch (err) {
		return {
			name: 'qbittorrent',
			configured: true,
			online: false,
			statusCode: err.response?.status || null,
			latencyMs: Date.now() - startedAt,
			downloads: [],
			error: err.message,
		};
	}
}

async function fetchNzbgetDownloads() {
	const startedAt = Date.now();
	try {
		const rpc = await getNzbgetRpcResult('listgroups');
		if (!rpc.configured) {
			return {name: 'nzbget', configured: false, online: false, downloads: [], error: rpc.error};
		}

		const groups = Array.isArray(rpc.result) ? rpc.result : [];
		const downloads = groups
			.filter((group) => {
				const status = String(group?.Status || group?.status || '').toLowerCase();
				const activeDownloads = toNumber(group?.ActiveDownloads ?? group?.activeDownloads, 0);
				return status.includes('download') || status.includes('fetch') || activeDownloads > 0;
			})
			.map(mapNzbgetDownload)
			.slice(0, 5);

		return {
			name: 'nzbget',
			configured: true,
			online: true,
			statusCode: 200,
			latencyMs: Date.now() - startedAt,
			downloads,
			error: null,
		};
	} catch (err) {
		return {
			name: 'nzbget',
			configured: true,
			online: false,
			statusCode: err.response?.status || null,
			latencyMs: Date.now() - startedAt,
			downloads: [],
			error: err.message,
		};
	}
}

async function probeNasUsage() {
	if (!NAS_USAGE_PATH) {
		return {
			name: NAS_USAGE_LABEL,
			configured: false,
			online: false,
			path: null,
			totalBytes: null,
			usedBytes: null,
			freeBytes: null,
			usedPercent: null,
			error: 'Not configured',
		};
	}

	try {
		const stats = await fs.promises.statfs(NAS_USAGE_PATH);
		return {
			name: NAS_USAGE_LABEL,
			...buildNasSummary(NAS_USAGE_PATH, stats),
		};
	} catch (err) {
		return {
			name: NAS_USAGE_LABEL,
			configured: true,
			online: false,
			path: NAS_USAGE_PATH,
			totalBytes: null,
			usedBytes: null,
			freeBytes: null,
			usedPercent: null,
			error: err.message,
		};
	}
}

async function tryFetchProwlarrList(baseUrl, apiKey, path) {
	const url = buildServiceUrl(baseUrl, path);
	if (!url) return [];

	const headers = {};
	if (apiKey) {
		headers['X-Api-Key'] = apiKey;
		headers['x-api-key'] = apiKey;
	}

	try {
		const response = await axios.get(url, {
			headers,
			timeout: 5000,
			validateStatus: () => true,
		});
		if (response.status < 200 || response.status >= 400 || !Array.isArray(response.data)) {
			return [];
		}
		return response.data;
	} catch (_err) {
		return [];
	}
}

function indexStatusFor(statuses, indexerId) {
	return statuses.find((item) => item?.indexerId === indexerId || item?.id === indexerId) || null;
}

function toOnlineState(entity, statusEntry) {
	if (!statusEntry) {
		return Boolean(entity?.enable ?? entity?.enabled ?? true);
	}

	const statusText = String(statusEntry.status || '').toLowerCase();
	if (statusText.includes('error') || statusText.includes('failed')) {
		return false;
	}
	if (statusText.includes('ok') || statusText.includes('healthy') || statusText.includes('available')) {
		return true;
	}

	if (statusEntry.lastErrorMessage || statusEntry.message) {
		return false;
	}

	return Boolean(entity?.enable ?? entity?.enabled ?? true);
}

function mapProbeToClientItem(service, fallbackName) {
	if (!service?.configured) {
		return null;
	}

	return {
		id: service.name,
		name: fallbackName,
		enabled: true,
		online: Boolean(service.online),
		error: service.error || null,
	};
}

async function probeQbittorrent() {
	const targetUrl = buildServiceUrl(QBITTORRENT_URL, QBITTORRENT_STATUS_PATH);
	if (!targetUrl) {
		return {
			name: 'qbittorrent',
			configured: false,
			online: false,
			statusCode: null,
			latencyMs: null,
			error: 'Not configured',
		};
	}

	if (!QBITTORRENT_USERNAME || !QBITTORRENT_PASSWORD) {
		return {
			name: 'qbittorrent',
			configured: false,
			online: false,
			statusCode: null,
			latencyMs: null,
			error: 'Missing credentials',
		};
	}

	const startedAt = Date.now();

	try {
		const cookie = await getQbittorrentCookie();
		const statusResponse = await axios.get(targetUrl, {
			headers: cookie ? {Cookie: cookie} : {},
			timeout: 5000,
			validateStatus: () => true,
		});

		const online = statusResponse.status >= 200 && statusResponse.status < 400;
		return {
			name: 'qbittorrent',
			configured: true,
			online,
			statusCode: statusResponse.status,
			latencyMs: Date.now() - startedAt,
			error: online ? null : `HTTP ${statusResponse.status}`,
		};
	} catch (err) {
		return {
			name: 'qbittorrent',
			configured: true,
			online: false,
			statusCode: err.response?.status || null,
			latencyMs: Date.now() - startedAt,
			error: err.message,
		};
	}
}

async function probeNzbget() {
	const targetUrl = buildServiceUrl(NZBGET_URL, NZBGET_STATUS_PATH);
	if (!targetUrl) {
		return {
			name: 'nzbget',
			configured: false,
			online: false,
			statusCode: null,
			latencyMs: null,
			error: 'Not configured',
		};
	}

	try {
		const rpc = await getNzbgetRpcResult('status');
		if (!rpc.configured) {
			return {
				name: 'nzbget',
				configured: false,
				online: false,
				statusCode: null,
				latencyMs: null,
				error: rpc.error,
			};
		}

		return {
			name: 'nzbget',
			configured: true,
			online: true,
			statusCode: 200,
			latencyMs: 0,
			error: null,
		};
	} catch (err) {
		return {
			name: 'nzbget',
			configured: true,
			online: false,
			statusCode: err.response?.status || null,
			latencyMs: null,
			error: err.message,
		};
	}
}

function mergeClientLists(primary = [], secondary = []) {
	const merged = [];
	const seen = new Set();

	for (const item of [...primary, ...secondary]) {
		if (!item) continue;
		const key = String(item.name || item.id || '').toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		merged.push(item);
	}

	return merged;
}

async function fetchProwlarrDetails() {
	const prowlarr = await probeService('prowlarr', {
		baseUrl: INDEXER_URL,
		statusPath: INDEXER_STATUS_PATH,
		apiKey: INDEXER_API_KEY,
	});

	if (!prowlarr.configured) {
		return {
			prowlarr,
			indexers: buildSummary([], false, false),
		};
	}

	const [rawIndexers, rawIndexerStatuses] = await Promise.all([
		tryFetchProwlarrList(INDEXER_URL, INDEXER_API_KEY, '/api/v1/indexer'),
		tryFetchProwlarrList(INDEXER_URL, INDEXER_API_KEY, '/api/v1/indexerstatus'),
	]);

	const indexers = rawIndexers.map((indexer) => {
		const statusEntry = indexStatusFor(rawIndexerStatuses, indexer.id);
		return {
			id: indexer.id,
			name: indexer.name || indexer.implementationName || `Indexer ${indexer.id}`,
			enabled: Boolean(indexer.enable ?? indexer.enabled ?? true),
			online: toOnlineState(indexer, statusEntry),
			error: statusEntry?.lastErrorMessage || statusEntry?.message || null,
		};
	});

	return {
		prowlarr,
		indexers: buildSummary(indexers, true, prowlarr.online),
	};
}

async function fetchHomebridgeDevices() {
	logHomebridge('accessories.fetch_start');
	const token = await getToken();
	const res = await axios.get(`${HOMEBRIDGE_URL}/api/accessories`, {
		headers: {Authorization: `Bearer ${token}`},
		timeout: 5000,
	});

	logHomebridge('accessories.fetch_success', {count: res.data.length});

	const mapped = res.data.map((acc) => {
		if (isHiddenAccessory(acc)) {
			logHomebridge('accessory.skipped_hidden', {id: acc.uniqueId, name: acc.serviceName});
			return null;
		}

		const onChar = acc.serviceCharacteristics?.find((c) => c.type === 'On');
		const brightnessChar = acc.serviceCharacteristics?.find((c) => c.type === 'Brightness');
		const hueChar = acc.serviceCharacteristics?.find((c) => c.type === 'Hue');
		const saturationChar = acc.serviceCharacteristics?.find((c) => c.type === 'Saturation');
		const room = resolveRoomName(acc);
		const type = classifyAccessory(acc);
		const supportsColor = Boolean(hueChar && saturationChar);
		const supportsBrightness = Boolean(brightnessChar);
		const hue = supportsColor ? Number(hueChar.value) : null;
		const saturation = supportsColor ? Number(saturationChar.value) : null;
		const canToggle = Boolean(onChar) && type !== 'bridge' && type !== 'remote';

		if (type === 'bridge' || type === 'remote') {
			logHomebridge('accessory.skipped_filtered_type', {id: acc.uniqueId, name: acc.serviceName, type});
			return null;
		}

		const isActionable = canToggle || supportsBrightness || supportsColor;

		if (!isActionable) {
			logHomebridge('accessory.skipped_non_actionable', {id: acc.uniqueId, name: acc.serviceName, type});
			return null;
		}

		return {
			id: acc.uniqueId,
			name: acc.serviceName,
			room,
			type,
			state: onChar ? toBoolean(onChar.value) : false,
			brightness: brightnessChar ? Number(brightnessChar.value) : null,
			supportsBrightness,
			supportsColor,
			hue,
			saturation,
			color: supportsColor ? hueSatToHex(hue, saturation) : null,
			canToggle,
		};
	});

	return mapped
		.filter(Boolean)
		.sort((a, b) => `${a.name}`.localeCompare(`${b.name}`));
}

async function setCharacteristic(deviceId, characteristicType, value) {
	return enqueueDeviceWrite(deviceId, async () => {
		const cacheKey = `${deviceId}:${characteristicType}`;
		if (lastCharacteristicValues.get(cacheKey) === value) {
			logHomebridge('accessory.characteristic_write_skip_unchanged', {
				deviceId,
				characteristicType,
				value,
			});
			return;
		}

		const token = await getToken();
		const safeId = encodeURIComponent(deviceId);
		logHomebridge('accessory.characteristic_write_start', {
			deviceId,
			characteristicType,
			value,
		});

		await axios.put(
			`${HOMEBRIDGE_URL}/api/accessories/${safeId}`,
			{characteristicType, value},
			{headers: {Authorization: `Bearer ${token}`}}
		);

		lastCharacteristicValues.set(cacheKey, value);
		logHomebridge('accessory.characteristic_write_success', {deviceId, characteristicType});
	});
}

router.get('/devices', async (_req, res) => {
	try {
		const devices = await fetchHomebridgeDevices();
		res.json(devices);
	} catch (err) {
		const details = getErrorDetails(err);
		logHomebridge('accessories.fetch_error', details);
		res.status(502).json({error: 'Failed to fetch Homebridge accessories', details});
	}
});

router.post('/toggle', async (req, res) => {
	const {deviceId, state} = req.body;
	if (deviceId === undefined || state === undefined) {
		return res.status(400).json({error: 'deviceId and state are required'});
	}

	if (!DEVICE_ID_PATTERN.test(String(deviceId))) {
		return res.status(400).json({error: 'Invalid deviceId format'});
	}

	try {
		await setCharacteristic(deviceId, 'On', state);
		res.json({success: true, deviceId, state});
	} catch (err) {
		console.error('Toggle error:', err.message);
		logHomebridge('accessory.toggle_error', {deviceId, ...getErrorDetails(err)});
		res.status(502).json({error: 'Failed to toggle device'});
	}
});

router.post('/brightness', async (req, res) => {
	const {deviceId, brightness} = req.body;
	if (deviceId === undefined || brightness === undefined) {
		return res.status(400).json({error: 'deviceId and brightness are required'});
	}

	if (!DEVICE_ID_PATTERN.test(String(deviceId))) {
		return res.status(400).json({error: 'Invalid deviceId format'});
	}

	const normalized = clamp(Number(brightness), 0, 100);
	if (Number.isNaN(normalized)) {
		return res.status(400).json({error: 'brightness must be a number between 0 and 100'});
	}

	try {
		await setCharacteristic(deviceId, 'Brightness', normalized);
		if (normalized > 0) {
			await setCharacteristic(deviceId, 'On', true);
		}
		res.json({success: true, deviceId, brightness: normalized});
	} catch (err) {
		logHomebridge('accessory.brightness_error', {deviceId, ...getErrorDetails(err)});
		res.status(502).json({error: 'Failed to set brightness'});
	}
});

router.post('/color', async (req, res) => {
	const {deviceId, color} = req.body;
	if (deviceId === undefined || color === undefined) {
		return res.status(400).json({error: 'deviceId and color are required'});
	}

	if (!DEVICE_ID_PATTERN.test(String(deviceId))) {
		return res.status(400).json({error: 'Invalid deviceId format'});
	}

	const rgb = parseHexColor(color);
	if (!rgb) {
		return res.status(400).json({error: 'color must be a hex value like #66ccff'});
	}

	const {hue, saturation} = rgbToHueSat(rgb);


	try {
		await setCharacteristic(deviceId, 'Hue', hue);
		await setCharacteristic(deviceId, 'Saturation', saturation);
		await setCharacteristic(deviceId, 'On', true);
		res.json({success: true, deviceId, color: hueSatToHex(hue, saturation), hue, saturation});
	} catch (err) {
		logHomebridge('accessory.color_error', {deviceId, ...getErrorDetails(err)});
		res.status(502).json({error: 'Failed to set color'});
	}
});

router.get('/services-status', async (_req, res) => {
	const [prowlarrDetails, qbittorrentClient, nzbgetClient, qbittorrentDownloads, nzbgetDownloads, nasUsage] = await Promise.all([
		fetchProwlarrDetails(),
		probeQbittorrent(),
		probeNzbget(),
		fetchQbittorrentDownloads(),
		fetchNzbgetDownloads(),
		probeNasUsage(),
	]);

	const downloadActivity = buildSummary(
		mergeClientLists([
			qbittorrentDownloads,
			nzbgetDownloads,
		]),
		Boolean(qbittorrentDownloads.configured || nzbgetDownloads.configured),
		Boolean(qbittorrentDownloads.online || nzbgetDownloads.online)
	);

	const explicitClients = mergeClientLists([], [
		mapProbeToClientItem(qbittorrentClient, 'qBittorrent'),
		mapProbeToClientItem(nzbgetClient, 'NZBGet'),
	]);

	const downloadClientsSummary = buildSummary(
		explicitClients,
		explicitClients.length > 0,
		explicitClients.some((item) => item.online)
	);

	res.json({
		prowlarr: prowlarrDetails.prowlarr,
		indexers: prowlarrDetails.indexers,
		downloadClients: downloadClientsSummary,
		downloadActivity,
		nasUsage,
		indexer: {
			configured: prowlarrDetails.prowlarr.configured,
			online: prowlarrDetails.prowlarr.online,
			statusCode: prowlarrDetails.prowlarr.statusCode,
			latencyMs: prowlarrDetails.prowlarr.latencyMs,
			error: prowlarrDetails.prowlarr.error,
		},
		downloadClient: {
			name: 'downloadClient',
			configured: downloadClientsSummary.configured,
			online: downloadClientsSummary.online,
			statusCode: null,
			latencyMs: null,
			error: downloadClientsSummary.configured ? null : 'Not configured',
		},
	});
});

module.exports = router;
