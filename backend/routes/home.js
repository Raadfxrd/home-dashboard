const express = require('express');
const axios = require('axios');
const fs = require('fs');
const http = require('http');
const https = require('https');
const snmp = require('net-snmp');
const issueLog = require('../lib/issueLog');

axios.defaults.httpAgent = new http.Agent({keepAlive: false, maxSockets: 32});
axios.defaults.httpsAgent = new https.Agent({keepAlive: false, maxSockets: 32});

const router = express.Router();

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

function logNasMetrics(event, details = {}, level = 'info') {
	// Failures always reach the dashboard's log, even with NAS logging off
	// (without filling the container's output every 10 seconds).
	if (level === 'error' && !NAS_METRICS_LOG_ENABLED) {
		issueLog.record('error', ['[NAS]', event, details?.message || '', details?.host ? `(${details.host})` : '']);
		return;
	}
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
	// Virtual links (containers, VPNs) would count the same traffic twice.
	return !/^(lo|loopback|docker|veth|br-|zt|tun|tap|tailscale|wg)/i.test(String(name));
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
		const [systemBinds, cpuIdleBind, memoryBinds, hrProcessorLoads, storageRows, ifNameRows, ifHcInRows, ifHcOutRows, ifInRows, ifOutRows] = await Promise.all([
			snmpGetAsync(session, [
				'1.3.6.1.2.1.1.5.0',    // sysName
				'1.3.6.1.2.1.25.1.1.0', // hrSystemUptime (hundredths of a second)
			]).catch(() => null),
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

		const nothingAnswered = !systemBinds && !cpuIdleBind && !memoryBinds
			&& hrProcessorLoads.length === 0 && storageRows.length === 0 && ifNameRows.length === 0;
		if (nothingAnswered) {
			throw new Error(`No answer from SNMP on ${NAS_SNMP_HOST}:${NAS_SNMP_PORT}`);
		}

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
			hostName: String(getSnmpValueByOid(systemBinds || [], '1.3.6.1.2.1.1.5.0') || '').trim() || null,
			uptimeSeconds: (() => {
				const ticks = toNumber(getSnmpValueByOid(systemBinds || [], '1.3.6.1.2.1.25.1.1.0'), NaN);
				return Number.isFinite(ticks) ? Math.round(ticks / 100) : null;
			})(),
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

/* ---------- System history ----------
   The NAS is sampled here on a timer, independent of who is looking, so the
   graphs are already full when the page opens and look the same on every
   device. Kept in memory: the last hour at full resolution and the last day
   in 5-minute buckets. A restart starts the history again. */

const HISTORY_SAMPLE_MS = Math.max(5000, Number(process.env.NAS_HISTORY_SAMPLE_MS || 10000));
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BUCKET_MS = 5 * 60 * 1000;

const systemHistory = {
	recent: [], // {t, cpu, rx, tx}
	buckets: [], // {t, cpu, cpuMax, rx, tx}
	open: null, // the 5-minute bucket being filled
};

function addHistorySample(metrics) {
	if (!metrics?.online) return;
	const t = Date.now();
	if (!Number.isFinite(metrics.cpu?.usagePercent) && !Number.isFinite(metrics.network?.totalRxRateBytesPerSecond)) return;
	const sample = {
		t,
		cpu: Number.isFinite(metrics.cpu?.usagePercent) ? metrics.cpu.usagePercent : null,
		rx: Number.isFinite(metrics.network?.totalRxRateBytesPerSecond) ? metrics.network.totalRxRateBytesPerSecond : null,
		tx: Number.isFinite(metrics.network?.totalTxRateBytesPerSecond) ? metrics.network.totalTxRateBytesPerSecond : null,
	};

	systemHistory.recent.push(sample);
	while (systemHistory.recent.length && systemHistory.recent[0].t < t - HOUR_MS) systemHistory.recent.shift();

	const bucketStart = Math.floor(t / BUCKET_MS) * BUCKET_MS;
	if (!systemHistory.open || systemHistory.open.t !== bucketStart) {
		if (systemHistory.open) systemHistory.buckets.push(closeBucket(systemHistory.open));
		systemHistory.open = {t: bucketStart, cpu: [], rx: [], tx: []};
	}
	if (sample.cpu != null) systemHistory.open.cpu.push(sample.cpu);
	if (sample.rx != null) systemHistory.open.rx.push(sample.rx);
	if (sample.tx != null) systemHistory.open.tx.push(sample.tx);
	while (systemHistory.buckets.length && systemHistory.buckets[0].t < t - DAY_MS) systemHistory.buckets.shift();
}

function average(values) {
	return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function closeBucket(bucket) {
	return {
		t: bucket.t,
		cpu: average(bucket.cpu) == null ? null : Math.round(average(bucket.cpu)),
		cpuMax: bucket.cpu.length ? Math.max(...bucket.cpu) : null,
		rx: average(bucket.rx) == null ? null : Math.round(average(bucket.rx)),
		tx: average(bucket.tx) == null ? null : Math.round(average(bucket.tx)),
	};
}

function summarize(points, peakKey = 'cpu') {
	const cpu = points.map((p) => p.cpu).filter((v) => v != null);
	let peak = null;
	for (const p of points) {
		const value = p[peakKey] ?? p.cpu;
		if (value != null && (!peak || value > peak.value)) peak = {value, t: p.t};
	}
	const rx = points.map((p) => p.rx).filter((v) => v != null);
	const tx = points.map((p) => p.tx).filter((v) => v != null);
	return {
		cpuAverage: cpu.length ? Math.round(average(cpu)) : null,
		cpuPeak: peak ? Math.round(peak.value) : null,
		cpuPeakAt: peak ? peak.t : null,
		rxPeak: rx.length ? Math.max(...rx) : null,
		txPeak: tx.length ? Math.max(...tx) : null,
	};
}

async function sampleSystem() {
	try {
		addHistorySample(await probeNasMetrics());
	} catch (err) {
		logNasMetrics('history.sample_error', {message: err.message}, 'error');
	}
}

if ((NAS_METRICS_MODE || (NAS_SNMP_HOST ? 'snmp' : 'none')) === 'snmp') {
	sampleSystem();
	setInterval(sampleSystem, HISTORY_SAMPLE_MS).unref();
}

router.get('/system-history', (req, res) => {
	const range = req.query.range === '24h' ? '24h' : '1h';
	if (range === '1h') {
		const points = systemHistory.recent.slice();
		return res.json({range, stepSeconds: HISTORY_SAMPLE_MS / 1000, from: Date.now() - HOUR_MS, to: Date.now(), points, stats: summarize(points)});
	}
	const points = systemHistory.buckets.concat(systemHistory.open ? [closeBucket(systemHistory.open)] : []);
	return res.json({range, stepSeconds: BUCKET_MS / 1000, from: Date.now() - DAY_MS, to: Date.now(), points, stats: summarize(points, 'cpuMax')});
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
