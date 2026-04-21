const express = require('express');
const axios = require('axios');
const fs = require('fs');
const http = require('http');
const https = require('https');
const snmp = require('net-snmp');

axios.defaults.httpAgent = new http.Agent({keepAlive: false, maxSockets: 32});
axios.defaults.httpsAgent = new https.Agent({keepAlive: false, maxSockets: 32});

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
const DOWNLOAD_ACTIVITY_MAX_ITEMS = Math.max(1, Number(process.env.DOWNLOAD_ACTIVITY_MAX_ITEMS || 50));
const EXTERNAL_HTTP_TIMEOUT_MS = Math.max(5000, Math.min(120000, Number(process.env.EXTERNAL_HTTP_TIMEOUT_MS || 10000)));
const NZBGET_URL = process.env.NZBGET_URL || '';
const NZBGET_USERNAME = process.env.NZBGET_USERNAME || '';
const NZBGET_PASSWORD = process.env.NZBGET_PASSWORD || '';
const NZBGET_STATUS_PATH = process.env.NZBGET_STATUS_PATH || '/jsonrpc';
const NAS_USAGE_PATH = process.env.NAS_USAGE_PATH || '';
const NAS_USAGE_LABEL = process.env.NAS_USAGE_LABEL || 'NAS';
const NAS_METRICS_MODE = String(process.env.NAS_METRICS_MODE || '').trim().toLowerCase();
const NAS_SNMP_HOST = String(process.env.NAS_SNMP_HOST || '').trim();
const NAS_SNMP_PORT = Number(process.env.NAS_SNMP_PORT || 161);
const NAS_SNMP_VERSION = String(process.env.NAS_SNMP_VERSION || '2c').trim().toLowerCase();
const NAS_SNMP_COMMUNITY = process.env.NAS_SNMP_COMMUNITY || 'public';
const NAS_SNMP_TIMEOUT_MS = Number(process.env.NAS_SNMP_TIMEOUT_MS || 3500);
const NAS_SNMP_RETRIES = Number(process.env.NAS_SNMP_RETRIES || 1);
const NAS_NETWORK_INTERFACES = String(process.env.NAS_NETWORK_INTERFACES || '')
	.split(',')
	.map((item) => item.trim())
	.filter(Boolean);
const NAS_METRICS_CACHE_TTL_MS = Number(process.env.NAS_METRICS_CACHE_TTL_MS || 1500);
const NAS_METRICS_LOG_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.NAS_METRICS_LOG_ENABLED || 'false').trim());
const NAS_METRICS_LOG_VERBOSE = /^(1|true|yes|on)$/i.test(String(process.env.NAS_METRICS_LOG_VERBOSE || 'false').trim());

let homebridgeToken = null;
let tokenExpiry = 0;
let tokenPromise = null;
const deviceWriteQueues = new Map();
const lastCharacteristicValues = new Map();
const nasMetricsCache = {
	value: null,
	expiresAt: 0,
	inFlight: null,
};
let qbittorrentCookiePromise = null;
const nasNetworkSnapshot = {
	timestamp: 0,
	interfaces: new Map(),
};

function logHomebridge(event, details = {}) {
	console.log('[Homebridge]', event, details);
}

function logNasMetrics(event, details = {}, level = 'info') {
	if (!NAS_METRICS_LOG_ENABLED) return;
	if (level === 'debug' && !NAS_METRICS_LOG_VERBOSE) return;
	const now = new Date();
	const datePart = now.toLocaleDateString('sv-SE');
	const timePart = now.toLocaleTimeString('sv-SE', {hour12: false});
	const millis = String(now.getMilliseconds()).padStart(3, '0');
	const offsetMinutes = -now.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? '+' : '-';
	const absOffset = Math.abs(offsetMinutes);
	const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
	const offsetMins = String(absOffset % 60).padStart(2, '0');
	const timestamp = `${datePart} ${timePart}.${millis} ${sign}${offsetHours}:${offsetMins}`;
	console.log('[NAS]', timestamp, event, details);
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
			timeout: EXTERNAL_HTTP_TIMEOUT_MS,
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

function createEmptyNasMetrics(error = 'Not configured') {
	return {
		configured: false,
		online: false,
		source: null,
		label: NAS_USAGE_LABEL,
		cpu: {usagePercent: null},
		memory: {totalBytes: null, usedBytes: null, freeBytes: null, usedPercent: null},
		disk: {totalBytes: null, usedBytes: null, freeBytes: null, usedPercent: null, volumes: []},
		network: {
			interfaces: [],
			totalRxRateBytesPerSecond: null,
			totalTxRateBytesPerSecond: null,
		},
		error,
	};
}

function parseSnmpVersion(value) {
	if (value === '1' || value === 'v1') return snmp.Version1;
	if (value === '3' || value === 'v3') return snmp.Version3;
	return snmp.Version2c;
}

function snmpGetAsync(session, oids) {
	return new Promise((resolve, reject) => {
		session.get(oids, (err, varbinds) => {
			if (err) return reject(err);
			for (const varbind of varbinds) {
				if (snmp.isVarbindError(varbind)) {
					return reject(new Error(snmp.varbindError(varbind)));
				}
			}
			resolve(varbinds);
		});
	});
}

function snmpSubtreeAsync(session, oid) {
	return new Promise((resolve, reject) => {
		const rows = [];
		session.subtree(
			oid,
			(varbinds) => {
				for (const varbind of varbinds) {
					if (!snmp.isVarbindError(varbind)) {
						rows.push(varbind);
					}
				}
			},
			(err) => (err ? reject(err) : resolve(rows))
		);
	});
}

function getSnmpValueByOid(varbinds, oid) {
	return varbinds.find((item) => item.oid === oid)?.value;
}

function normalizeCounter(value) {
	if (typeof value === 'number') return value;
	if (typeof value === 'bigint') return Number(value);
	if (Buffer.isBuffer(value)) {
		let result = 0;
		for (const byte of value.values()) {
			result = result * 256 + byte;
		}
		return result;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function parseIndexedTable(varbinds, baseOid) {
	const table = new Map();
	for (const vb of varbinds) {
		if (!vb.oid.startsWith(`${baseOid}.`)) continue;
		const suffix = vb.oid.slice(baseOid.length + 1);
		const parts = suffix.split('.');
		if (parts.length < 2) continue;
		const column = parts[0];
		const index = parts.slice(1).join('.');
		const row = table.get(index) || {};
		row[column] = vb.value;
		table.set(index, row);
	}
	return table;
}

function shouldTrackInterface(name) {
	if (!name) return false;
	if (NAS_NETWORK_INTERFACES.length > 0) {
		return NAS_NETWORK_INTERFACES.some((item) => item.toLowerCase() === String(name).toLowerCase());
	}
	return !/^(lo|loopback|docker|veth|br-|zt|tun|tap)/i.test(String(name));
}

function mapDiskUsageFromStorage(rows) {
	const fixedDiskTypeOid = '1.3.6.1.2.1.25.2.1.4';
	const rawVolumes = [];

	for (const [index, row] of rows.entries()) {
		const typeOid = String(row['2'] || '');
		const allocationUnit = toNumber(row['4'], 0);
		const sizeUnits = toNumber(row['5'], 0);
		const usedUnits = toNumber(row['6'], 0);
		const name = String(row['3'] || `volume-${index}`);

		if (typeOid !== fixedDiskTypeOid) continue;
		if (allocationUnit <= 0 || sizeUnits <= 0) continue;

		const totalBytes = allocationUnit * sizeUnits;
		const usedBytes = Math.max(0, allocationUnit * usedUnits);
		const freeBytes = Math.max(totalBytes - usedBytes, 0);
		const usedPercent = totalBytes > 0 ? clamp(Math.round((usedBytes / totalBytes) * 100), 0, 100) : 0;

		rawVolumes.push({
			name,
			totalBytes,
			usedBytes,
			freeBytes,
			usedPercent,
		});
	}

	const mountPreferenceScore = (volumeName) => {
		const name = String(volumeName || '').toLowerCase();
		if (/^\/volume\d+$/.test(name)) return 100;
		if (name.startsWith('/volume')) return 80;
		if (name.startsWith('/share/')) return 20;
		return 50;
	};

	const dedupedBySignature = new Map();
	for (const volume of rawVolumes) {
		const signature = `${volume.totalBytes}:${volume.usedBytes}`;
		const existing = dedupedBySignature.get(signature);
		if (!existing) {
			dedupedBySignature.set(signature, volume);
			continue;
		}

		const existingScore = mountPreferenceScore(existing.name);
		const currentScore = mountPreferenceScore(volume.name);
		const shouldReplace = currentScore > existingScore
			|| (currentScore === existingScore && String(volume.name).length < String(existing.name).length);
		if (shouldReplace) {
			dedupedBySignature.set(signature, volume);
		}
	}

	const volumes = Array.from(dedupedBySignature.values());

	const totalBytes = volumes.reduce((acc, item) => acc + item.totalBytes, 0);
	const usedBytes = volumes.reduce((acc, item) => acc + item.usedBytes, 0);
	const freeBytes = Math.max(totalBytes - usedBytes, 0);
	const usedPercent = totalBytes > 0 ? clamp(Math.round((usedBytes / totalBytes) * 100), 0, 100) : null;

	return {
		totalBytes: totalBytes || null,
		usedBytes: totalBytes ? usedBytes : null,
		freeBytes: totalBytes ? freeBytes : null,
		usedPercent,
		volumes: volumes.sort((a, b) => b.usedBytes - a.usedBytes).slice(0, 4),
	};
}

function mapMemoryFromStorage(rows) {
	for (const row of rows.values()) {
		const typeOid = String(row['2'] || '');
		const name = String(row['3'] || '').toLowerCase();
		if (typeOid !== '1.3.6.1.2.1.25.2.1.2' && !name.includes('memory') && !name.includes('ram')) {
			continue;
		}

		const allocationUnit = toNumber(row['4'], 0);
		const sizeUnits = toNumber(row['5'], 0);
		const usedUnits = toNumber(row['6'], 0);
		if (allocationUnit <= 0 || sizeUnits <= 0) continue;

		const totalBytes = allocationUnit * sizeUnits;
		const usedBytes = Math.max(0, allocationUnit * usedUnits);
		const freeBytes = Math.max(totalBytes - usedBytes, 0);
		const usedPercent = totalBytes > 0 ? clamp(Math.round((usedBytes / totalBytes) * 100), 0, 100) : null;
		return {totalBytes, usedBytes, freeBytes, usedPercent};
	}

	return {totalBytes: null, usedBytes: null, freeBytes: null, usedPercent: null};
}

async function fetchSnmpNasMetrics() {
	if (!NAS_SNMP_HOST) {
		return createEmptyNasMetrics('Missing NAS_SNMP_HOST');
	}

	const session = snmp.createSession(NAS_SNMP_HOST, NAS_SNMP_COMMUNITY, {
		port: NAS_SNMP_PORT,
		version: parseSnmpVersion(NAS_SNMP_VERSION),
		timeout: NAS_SNMP_TIMEOUT_MS,
		retries: NAS_SNMP_RETRIES,
	});

	try {
		const [cpuIdleBind, memoryBinds, hrProcessorLoads, storageRows, ifNameRows, ifHcInRows, ifHcOutRows, ifInRows, ifOutRows] = await Promise.all([
			snmpGetAsync(session, ['1.3.6.1.4.1.2021.11.11.0']).catch(() => null),
			snmpGetAsync(session, [
				'1.3.6.1.4.1.2021.4.5.0',  // memTotalReal (kB)
				'1.3.6.1.4.1.2021.4.6.0',  // memAvailReal (kB)
				'1.3.6.1.4.1.2021.4.14.0', // memBuffer (kB)
				'1.3.6.1.4.1.2021.4.15.0', // memCached (kB)
			]).catch(() => null),
			snmpSubtreeAsync(session, '1.3.6.1.2.1.25.3.3.1.2').catch(() => []),
			snmpSubtreeAsync(session, '1.3.6.1.2.1.25.2.3.1').catch(() => []),
			snmpSubtreeAsync(session, '1.3.6.1.2.1.2.2.1.2').catch(() => []),
			snmpSubtreeAsync(session, '1.3.6.1.2.1.31.1.1.1.6').catch(() => []),
			snmpSubtreeAsync(session, '1.3.6.1.2.1.31.1.1.1.10').catch(() => []),
			snmpSubtreeAsync(session, '1.3.6.1.2.1.2.2.1.10').catch(() => []),
			snmpSubtreeAsync(session, '1.3.6.1.2.1.2.2.1.16').catch(() => []),
		]);

		const cpuLoadValues = hrProcessorLoads
			.map((item) => toNumber(item.value, NaN))
			.filter((value) => Number.isFinite(value) && value >= 0);
		const cpuIdle = toNumber(getSnmpValueByOid(cpuIdleBind || [], '1.3.6.1.4.1.2021.11.11.0'), NaN);
		const cpuUsagePercent = cpuLoadValues.length > 0
			? clamp(Math.round(cpuLoadValues.reduce((acc, value) => acc + value, 0) / cpuLoadValues.length), 0, 100)
			: (Number.isFinite(cpuIdle) ? clamp(Math.round(100 - cpuIdle), 0, 100) : null);

		const memoryTotalKb = toNumber(getSnmpValueByOid(memoryBinds || [], '1.3.6.1.4.1.2021.4.5.0'), NaN);
		const memoryAvailKb = toNumber(getSnmpValueByOid(memoryBinds || [], '1.3.6.1.4.1.2021.4.6.0'), NaN);
		const memoryBufferKb = toNumber(getSnmpValueByOid(memoryBinds || [], '1.3.6.1.4.1.2021.4.14.0'), NaN);
		const memoryCachedKb = toNumber(getSnmpValueByOid(memoryBinds || [], '1.3.6.1.4.1.2021.4.15.0'), NaN);

		const storageTable = parseIndexedTable(storageRows, '1.3.6.1.2.1.25.2.3.1');
		const memoryFromStorage = mapMemoryFromStorage(storageTable);
		const hasDetailedMemoryBreakdown = [memoryAvailKb, memoryBufferKb, memoryCachedKb].every(Number.isFinite);
		const effectiveAvailableKb = hasDetailedMemoryBreakdown
			? Math.max(memoryAvailKb, 0) + Math.max(memoryBufferKb, 0) + Math.max(memoryCachedKb, 0)
			: memoryAvailKb;
		const safeAvailableKb = Number.isFinite(memoryTotalKb) && Number.isFinite(effectiveAvailableKb)
			? clamp(effectiveAvailableKb, 0, Math.max(memoryTotalKb, 0))
			: NaN;

		const memory = Number.isFinite(memoryTotalKb) && Number.isFinite(safeAvailableKb)
			? {
				totalBytes: Math.max(memoryTotalKb, 0) * 1024,
				freeBytes: Math.max(safeAvailableKb, 0) * 1024,
				usedBytes: Math.max(memoryTotalKb - safeAvailableKb, 0) * 1024,
				usedPercent: memoryTotalKb > 0 ? clamp(Math.round(((memoryTotalKb - safeAvailableKb) / memoryTotalKb) * 100), 0, 100) : null,
			}
			: memoryFromStorage;

		const disk = mapDiskUsageFromStorage(storageTable);

		const ifNameMap = new Map();
		for (const item of ifNameRows) {
			const index = item.oid.split('.').pop();
			if (index) ifNameMap.set(index, String(item.value || '').trim());
		}

		const inCounterMap = new Map();
		for (const item of (ifHcInRows.length > 0 ? ifHcInRows : ifInRows)) {
			const index = item.oid.split('.').pop();
			if (index) inCounterMap.set(index, normalizeCounter(item.value));
		}

		const outCounterMap = new Map();
		for (const item of (ifHcOutRows.length > 0 ? ifHcOutRows : ifOutRows)) {
			const index = item.oid.split('.').pop();
			if (index) outCounterMap.set(index, normalizeCounter(item.value));
		}

		const now = Date.now();
		const elapsedMs = nasNetworkSnapshot.timestamp > 0 ? now - nasNetworkSnapshot.timestamp : 0;
		const networkInterfaces = [];

		for (const [index, name] of ifNameMap.entries()) {
			if (!shouldTrackInterface(name)) continue;
			const rxBytes = inCounterMap.get(index);
			const txBytes = outCounterMap.get(index);
			if (!Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) continue;

			const previous = nasNetworkSnapshot.interfaces.get(index);
			let rxRateBytesPerSecond = null;
			let txRateBytesPerSecond = null;
			if (previous && elapsedMs > 0 && rxBytes >= previous.rxBytes && txBytes >= previous.txBytes) {
				const elapsedSeconds = elapsedMs / 1000;
				rxRateBytesPerSecond = Math.max(0, Math.round((rxBytes - previous.rxBytes) / elapsedSeconds));
				txRateBytesPerSecond = Math.max(0, Math.round((txBytes - previous.txBytes) / elapsedSeconds));
			}

			networkInterfaces.push({
				index,
				name,
				rxBytes,
				txBytes,
				rxRateBytesPerSecond,
				txRateBytesPerSecond,
			});
		}

		nasNetworkSnapshot.timestamp = now;
		nasNetworkSnapshot.interfaces = new Map(
			networkInterfaces.map((item) => [
				item.index,
				{rxBytes: item.rxBytes, txBytes: item.txBytes},
			])
		);

		const totalRxRateBytesPerSecond = networkInterfaces.reduce(
			(acc, item) => acc + (Number.isFinite(item.rxRateBytesPerSecond) ? item.rxRateBytesPerSecond : 0),
			0
		);
		const totalTxRateBytesPerSecond = networkInterfaces.reduce(
			(acc, item) => acc + (Number.isFinite(item.txRateBytesPerSecond) ? item.txRateBytesPerSecond : 0),
			0
		);

		logNasMetrics('metrics.fetch_success', {
			host: NAS_SNMP_HOST,
			cpuUsagePercent,
			memoryUsedPercent: memory.usedPercent,
			diskUsedPercent: disk.usedPercent,
			interfaces: networkInterfaces.length,
		});

		return {
			configured: true,
			online: true,
			source: 'snmp',
			label: NAS_USAGE_LABEL,
			cpu: {usagePercent: cpuUsagePercent},
			memory,
			disk,
			network: {
				interfaces: networkInterfaces
					.sort((a, b) => (b.rxRateBytesPerSecond || 0) + (b.txRateBytesPerSecond || 0) - ((a.rxRateBytesPerSecond || 0) + (a.txRateBytesPerSecond || 0)))
					.slice(0, 4)
					.map(({index: _index, ...rest}) => rest),
				totalRxRateBytesPerSecond: networkInterfaces.some((item) => Number.isFinite(item.rxRateBytesPerSecond)) ? totalRxRateBytesPerSecond : null,
				totalTxRateBytesPerSecond: networkInterfaces.some((item) => Number.isFinite(item.txRateBytesPerSecond)) ? totalTxRateBytesPerSecond : null,
			},
			error: null,
		};
	} catch (err) {
		logNasMetrics('metrics.fetch_error', {
			host: NAS_SNMP_HOST,
			message: err.message,
			code: err.code || null,
		}, 'error');
		return {
			...createEmptyNasMetrics(err.message),
			configured: true,
			source: 'snmp',
			error: err.message,
		};
	} finally {
		session.close();
	}
}

async function probeNasMetrics() {
	const mode = NAS_METRICS_MODE || (NAS_SNMP_HOST ? 'snmp' : 'none');
	if (mode !== 'snmp') {
		logNasMetrics('metrics.skipped', {reason: 'mode_not_snmp', mode}, 'debug');
		return createEmptyNasMetrics('Not configured');
	}

	const now = Date.now();
	if (nasMetricsCache.value && nasMetricsCache.expiresAt > now) {
		logNasMetrics('metrics.cache_hit', {expiresInMs: nasMetricsCache.expiresAt - now}, 'debug');
		return nasMetricsCache.value;
	}

	logNasMetrics('metrics.cache_miss', {cacheTtlMs: Math.max(1000, NAS_METRICS_CACHE_TTL_MS)}, 'debug');
	if (!nasMetricsCache.inFlight) {
		logNasMetrics('metrics.fetch_start', {host: NAS_SNMP_HOST, port: NAS_SNMP_PORT});
		nasMetricsCache.inFlight = fetchSnmpNasMetrics()
			.then((metrics) => {
				nasMetricsCache.value = metrics;
				nasMetricsCache.expiresAt = Date.now() + Math.max(1000, NAS_METRICS_CACHE_TTL_MS);
				return metrics;
			})
			.finally(() => {
				nasMetricsCache.inFlight = null;
			});
	} else {
		logNasMetrics('metrics.inflight_reuse', {}, 'debug');
	}

	return nasMetricsCache.inFlight;
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

function isQbittorrentActiveState(stateValue) {
	const state = String(stateValue || '').toLowerCase();
	if (!state) return false;
	return [
		'downloading',
		'forceddl',
		'stalleddl',
		'metadl',
		'queueddl',
		'checkdl',
		'checkingdl',
		'checkingresumedata',
	].some((part) => state.includes(part));
}

function qbittorrentStatePriority(stateValue) {
	const state = String(stateValue || '').toLowerCase();
	if (state.includes('downloading') || state.includes('forceddl')) return 0;
	if (state.includes('metadl') || state.includes('checkdl') || state.includes('checking')) return 1;
	if (state.includes('queued')) return 2;
	if (state.includes('stalled')) return 3;
	return 4;
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
	if (qbittorrentCookiePromise) {
		return qbittorrentCookiePromise;
	}

	const loginBody = new URLSearchParams({
		username: QBITTORRENT_USERNAME,
		password: QBITTORRENT_PASSWORD,
	});

	qbittorrentCookiePromise = axios.post(loginUrl, loginBody.toString(), {
		headers: {'Content-Type': 'application/x-www-form-urlencoded'},
		timeout: EXTERNAL_HTTP_TIMEOUT_MS,
		validateStatus: () => true,
	})
		.then((loginResponse) => {
			if (loginResponse.status < 200 || loginResponse.status >= 400) {
				throw new Error(`Login HTTP ${loginResponse.status}`);
			}

			const cookie = (loginResponse.headers['set-cookie'] || []).map((value) => value.split(';')[0]).join('; ');
			if (!cookie) {
				throw new Error('Missing session cookie');
			}

			return cookie;
		})
		.finally(() => {
			qbittorrentCookiePromise = null;
		});

	return qbittorrentCookiePromise;
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
			timeout: EXTERNAL_HTTP_TIMEOUT_MS,
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
			params: {filter: 'all', sort: 'priority', reverse: false},
			timeout: EXTERNAL_HTTP_TIMEOUT_MS,
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

		const downloads = response.data
			.filter((torrent) => isQbittorrentActiveState(torrent?.state))
			.sort((a, b) => {
				const stateSort = qbittorrentStatePriority(a?.state) - qbittorrentStatePriority(b?.state);
				if (stateSort !== 0) return stateSort;
				return toNumber(b?.dlspeed, 0) - toNumber(a?.dlspeed, 0);
			})
			.map(mapQbittorrentDownload)
			.slice(0, DOWNLOAD_ACTIVITY_MAX_ITEMS);

		return {
			name: 'qbittorrent',
			configured: true,
			online: true,
			statusCode: response.status,
			latencyMs: Date.now() - startedAt,
			downloads,
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
			.slice(0, DOWNLOAD_ACTIVITY_MAX_ITEMS);

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
			timeout: EXTERNAL_HTTP_TIMEOUT_MS,
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
			timeout: EXTERNAL_HTTP_TIMEOUT_MS,
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

	const rawIndexers = await tryFetchProwlarrList(INDEXER_URL, INDEXER_API_KEY, '/api/v1/indexer');
	const rawIndexerStatuses = await tryFetchProwlarrList(INDEXER_URL, INDEXER_API_KEY, '/api/v1/indexerstatus');

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
		timeout: EXTERNAL_HTTP_TIMEOUT_MS,
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
	try {
		const prowlarrDetails = await fetchProwlarrDetails();
		const qbittorrentClient = await probeQbittorrent();
		const qbittorrentDownloads = await fetchQbittorrentDownloads();
		const nzbgetClient = await probeNzbget();
		const nzbgetDownloads = await fetchNzbgetDownloads();
		const nasUsage = await probeNasUsage();
		const nasMetrics = await probeNasMetrics();

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
			nasMetrics,
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
	} catch (err) {
		console.error('Home services-status error:', getErrorDetails(err));
		res.status(502).json({error: 'Failed to fetch services status'});
	}
});

module.exports = router;
