const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');

/**
 * What arrives this week: episodes from Sonarr's calendar and film releases
 * (cinema, digital, disc) from Radarr's. Each service is optional and fails
 * on its own; the answer says which ones were configured and which failed.
 */
const router = express.Router();
const cache = new NodeCache({stdTTL: 600});

const SONARR_URL = (process.env.SONARR_URL || '').replace(/\/$/, '');
const SONARR_API_KEY = process.env.SONARR_API_KEY || '';
const RADARR_URL = (process.env.RADARR_URL || '').replace(/\/$/, '');
const RADARR_API_KEY = process.env.RADARR_API_KEY || '';
const DAYS_AHEAD = Math.max(1, Math.min(31, Number(process.env.UPCOMING_DAYS || 7)));
const TIMEOUT_MS = 10000;

function window() {
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	const end = new Date(start.getTime() + DAYS_AHEAD * 86400000);
	return {start, end};
}

function poster(images = []) {
	const img = images.find((i) => i.coverType === 'poster') || images[0];
	return img?.remoteUrl || null;
}

function code(season, episode) {
	if (!Number.isFinite(season) || !Number.isFinite(episode)) return null;
	return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

async function fetchSonarr({start, end}) {
	const response = await axios.get(`${SONARR_URL}/api/v3/calendar`, {
		headers: {'X-Api-Key': SONARR_API_KEY},
		params: {start: start.toISOString(), end: end.toISOString(), includeSeries: true, unmonitored: false},
		timeout: TIMEOUT_MS,
	});
	return (response.data || [])
		.filter((ep) => ep.airDateUtc)
		.map((ep) => ({
			id: `sonarr-${ep.id}`,
			kind: 'episode',
			title: ep.series?.title || 'Unknown series',
			subtitle: [code(ep.seasonNumber, ep.episodeNumber), ep.title].filter(Boolean).join(' · '),
			at: ep.airDateUtc,
			allDay: false,
			hasFile: Boolean(ep.hasFile),
			poster: poster(ep.series?.images),
		}));
}

const RELEASES = [
	['inCinemas', 'In cinemas'],
	['digitalRelease', 'Digital release'],
	['physicalRelease', 'On disc'],
];

async function fetchRadarr({start, end}) {
	const response = await axios.get(`${RADARR_URL}/api/v3/calendar`, {
		headers: {'X-Api-Key': RADARR_API_KEY},
		params: {start: start.toISOString(), end: end.toISOString(), unmonitored: false},
		timeout: TIMEOUT_MS,
	});
	const items = [];
	for (const movie of response.data || []) {
		for (const [field, label] of RELEASES) {
			const when = movie[field] ? new Date(movie[field]) : null;
			if (!when || when < start || when >= end) continue;
			items.push({
				id: `radarr-${movie.id}-${field}`,
				kind: 'movie',
				title: movie.title,
				subtitle: [label, movie.year].filter(Boolean).join(' · '),
				at: when.toISOString(),
				// Radarr release dates are days, not moments.
				allDay: true,
				hasFile: Boolean(movie.hasFile),
				poster: poster(movie.images),
			});
		}
	}
	return items;
}

/* Why a service couldn't be reached, in words that say what to fix. */
function reason(err, url) {
	const status = err.response?.status;
	if (status === 401 || status === 403) return 'API key rejected';
	if (status === 404) return 'not found at this address';
	if (status) return `answered HTTP ${status}`;
	if (err.code === 'ECONNREFUSED') return `nothing answering at ${url.replace(/^https?:\/\//, '')}`;
	if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message)) return 'timed out';
	if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') return 'address not found';
	return err.message;
}

router.get('/', async (_req, res) => {
	const configured = {
		sonarr: Boolean(SONARR_URL && SONARR_API_KEY),
		radarr: Boolean(RADARR_URL && RADARR_API_KEY),
	};
	if (!configured.sonarr && !configured.radarr) {
		return res.json({configured, items: [], failed: [], days: DAYS_AHEAD});
	}

	const hit = cache.get('upcoming');
	if (hit) return res.json(hit);

	const span = window();
	const failed = [];
	const [episodes, movies] = await Promise.all([
		configured.sonarr
			? fetchSonarr(span).catch((err) => {
				const why = reason(err, SONARR_URL);
				console.error('Sonarr calendar error:', why);
				failed.push({service: 'sonarr', reason: why});
				return [];
			})
			: [],
		configured.radarr
			? fetchRadarr(span).catch((err) => {
				const why = reason(err, RADARR_URL);
				console.error('Radarr calendar error:', why);
				failed.push({service: 'radarr', reason: why});
				return [];
			})
			: [],
	]);

	const items = [...episodes, ...movies].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.title.localeCompare(b.title));
	const payload = {configured, items, failed, days: DAYS_AHEAD, from: span.start.toISOString(), to: span.end.toISOString()};
	// Don't hold on to a half-failed answer for long.
	cache.set('upcoming', payload, failed.length ? 60 : 600);
	res.json(payload);
});

module.exports = router;
