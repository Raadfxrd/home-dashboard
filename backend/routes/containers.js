const express = require('express');
const axios = require('axios');
const fs = require('fs');

/**
 * Every container on the NAS with its state, memory and processor use,
 * read from the Docker socket (mounted read-only; only GET requests are
 * made). The same numbers `docker stats` shows, without an SSH session.
 */
const router = express.Router();

const SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const CACHE_MS = 15000;
let cached = null;
let cachedAt = 0;
let inFlight = null;

const docker = (path, params) =>
	axios.get(`http://docker${path}`, {socketPath: SOCKET, params, timeout: 8000});

/* Memory as `docker stats` reports it: usage minus reclaimable file cache. */
function memoryUsed(stats) {
	const usage = Number(stats?.memory_stats?.usage);
	if (!Number.isFinite(usage)) return null;
	const s = stats.memory_stats.stats || {};
	const cache = Number(s.inactive_file ?? s.total_inactive_file ?? s.cache ?? 0);
	return Math.max(0, usage - (Number.isFinite(cache) ? cache : 0));
}

function cpuPercent(stats) {
	const cpu = stats?.cpu_stats;
	const pre = stats?.precpu_stats;
	if (!cpu || !pre) return null;
	const cpuDelta = Number(cpu.cpu_usage?.total_usage) - Number(pre.cpu_usage?.total_usage);
	const systemDelta = Number(cpu.system_cpu_usage) - Number(pre.system_cpu_usage);
	const cpus = Number(cpu.online_cpus) || cpu.cpu_usage?.percpu_usage?.length || 1;
	if (!(cpuDelta >= 0) || !(systemDelta > 0)) return null;
	return Math.round((cpuDelta / systemDelta) * cpus * 1000) / 10;
}

function healthOf(status = '') {
	const match = /\((healthy|unhealthy|health: starting)\)/.exec(status);
	return match ? match[1].replace('health: ', '') : null;
}

async function load() {
	const {data: list} = await docker('/containers/json', {all: true});
	const items = await Promise.all(
		(list || []).map(async (c) => {
			const running = c.State === 'running';
			let stats = null;
			if (running) {
				try {
					// Without one-shot, Docker samples twice so CPU can be worked out.
					stats = (await docker(`/containers/${c.Id}/stats`, {stream: false})).data;
				} catch (err) {
					console.warn('Docker stats error for', c.Names?.[0], err.message);
				}
			}
			return {
				id: c.Id.slice(0, 12),
				name: String(c.Names?.[0] || c.Id).replace(/^\//, ''),
				image: c.Image,
				state: c.State,
				status: c.Status,
				health: healthOf(c.Status),
				memoryBytes: stats ? memoryUsed(stats) : null,
				cpuPercent: stats ? cpuPercent(stats) : null,
			};
		})
	);
	items.sort((a, b) => (a.state === 'running') - (b.state === 'running') || a.name.localeCompare(b.name, 'en', {sensitivity: 'base'}));
	return {
		configured: true,
		online: true,
		total: items.length,
		running: items.filter((i) => i.state === 'running').length,
		items,
		error: null,
	};
}

router.get('/', async (_req, res) => {
	if (!fs.existsSync(SOCKET)) {
		return res.json({configured: false, online: false, total: 0, running: 0, items: [], error: 'Docker socket not mounted'});
	}
	if (cached && Date.now() - cachedAt < CACHE_MS) return res.json(cached);
	try {
		inFlight = inFlight || load().finally(() => {
			inFlight = null;
		});
		cached = await inFlight;
		cachedAt = Date.now();
		res.json(cached);
	} catch (err) {
		const message = err.code === 'EACCES' ? 'No permission to read the Docker socket' : err.message;
		console.error('Docker containers error:', message);
		res.json({configured: true, online: false, total: 0, running: 0, items: [], error: message});
	}
});

module.exports = router;
