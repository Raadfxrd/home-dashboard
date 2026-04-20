const express = require('express');
const axios = require('axios');

const router = express.Router();

const JELLYFIN_URL = process.env.JELLYFIN_URL || 'http://localhost:8096';
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY || '';
const JELLYFIN_USER_ID = process.env.JELLYFIN_USER_ID || '';
let resolvedUserId = null;

function maskIdentifier(value) {
	if (!value) {
		return 'missing';
	}
	if (value.length <= 4) {
		return '****';
	}
	return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function getErrorDetails(err) {
	return {
		message: err.message,
		status: err.response?.status || null,
		code: err.code || null,
	};
}

function logJellyfin(event, details = {}) {
	console.log('[Jellyfin]', event, details);
}

function jellyfinHeaders() {
	return {
		'X-MediaBrowser-Token': JELLYFIN_API_KEY,
		'X-Emby-Authorization': `MediaBrowser Token="${JELLYFIN_API_KEY}"`,
	};
}

function buildPosterUrl(itemId) {
	const apiKeyQuery = JELLYFIN_API_KEY ? `?api_key=${encodeURIComponent(JELLYFIN_API_KEY)}` : '';
	return `${JELLYFIN_URL}/Items/${itemId}/Images/Primary${apiKeyQuery}`;
}

async function getResolvedUserId() {
	if (resolvedUserId) {
		logJellyfin('user.resolve.cache_hit', {userId: maskIdentifier(resolvedUserId)});
		return resolvedUserId;
	}

	if (!JELLYFIN_USER_ID) {
		return null;
	}

	// Keep compatibility: allow either a raw user ID (GUID) or a username.
	if (/^[a-f0-9-]{32,36}$/i.test(JELLYFIN_USER_ID)) {
		resolvedUserId = JELLYFIN_USER_ID;
		logJellyfin('user.resolve.direct_id', {userId: maskIdentifier(resolvedUserId)});
		return resolvedUserId;
	}

	try {
		logJellyfin('user.resolve.me_start');
		const meResponse = await axios.get(`${JELLYFIN_URL}/Users/Me`, {
			headers: jellyfinHeaders(),
		});
		if (meResponse.data?.Id) {
			resolvedUserId = meResponse.data.Id;
			logJellyfin('user.resolve.me_success', {userId: maskIdentifier(resolvedUserId)});
			return resolvedUserId;
		}
	} catch (err) {
		logJellyfin('user.resolve.me_failed', getErrorDetails(err));
	}

	logJellyfin('user.resolve.lookup_start', {username: maskIdentifier(JELLYFIN_USER_ID)});

	const response = await axios.get(`${JELLYFIN_URL}/Users`, {
		headers: jellyfinHeaders(),
	});

	const match = (response.data || []).find(
		(user) => user?.Name?.toLowerCase() === JELLYFIN_USER_ID.toLowerCase()
	);

	if (!match?.Id) {
		logJellyfin('user.resolve.lookup_miss', {username: maskIdentifier(JELLYFIN_USER_ID)});
		return null;
	}

	resolvedUserId = match.Id;
	logJellyfin('user.resolve.lookup_success', {userId: maskIdentifier(resolvedUserId)});
	return resolvedUserId;
}

function mapItems(items = []) {
	return items.map((item) => ({
		id: item.Id,
		title: item.Name,
		poster: buildPosterUrl(item.Id),
		type: item.Type,
		year: item.ProductionYear || null,
		progress: 0,
	}));
}

router.get('/continue', async (_req, res) => {
	if (!JELLYFIN_API_KEY || !JELLYFIN_USER_ID) {
		logJellyfin('continue.skipped_missing_config', {
			hasApiKey: Boolean(JELLYFIN_API_KEY),
			hasUser: Boolean(JELLYFIN_USER_ID),
		});
		return res.status(503).json({error: 'Jellyfin API key or user is not configured'});
	}
	try {
		const startedAt = Date.now();
		logJellyfin('continue.fetch_start', {userRef: maskIdentifier(JELLYFIN_USER_ID)});

		const userId = await getResolvedUserId();
		if (!userId) {
			logJellyfin('continue.fetch_failed_user_resolve', {userRef: maskIdentifier(JELLYFIN_USER_ID)});
			return res.status(502).json({error: 'Failed to resolve Jellyfin user ID'});
		}

		const response = await axios.get(
			`${JELLYFIN_URL}/Users/${userId}/Items/Resume`,
			{
				headers: jellyfinHeaders(),
				params: {
					Limit: 12,
					Fields: 'PrimaryImageAspectRatio,UserData',
					Recursive: true,
					IncludeItemTypes: 'Movie,Episode',
					EnableImages: true,
					ImageTypeLimit: 1,
				},
			}
		);

		const items = (response.data.Items || []).map((item) => {
			const ticks = item.RunTimeTicks || 0;
			const playedTicks = item.UserData?.PlaybackPositionTicks || 0;
			const progress = ticks > 0 ? Math.round((playedTicks / ticks) * 100) : 0;

			return {
				id: item.Id,
				title: item.Name,
				poster: buildPosterUrl(item.Id),
				progress,
				type: item.Type,
			};
		});

		logJellyfin('continue.fetch_success', {
			status: response.status,
			items: items.length,
			durationMs: Date.now() - startedAt,
		});

		res.json(items);
	} catch (err) {
		console.error('Jellyfin continue error:', getErrorDetails(err));
		res.status(502).json({error: 'Failed to fetch continue watching'});
	}
});

router.get('/recent', async (_req, res) => {
	if (!JELLYFIN_API_KEY || !JELLYFIN_USER_ID) {
		logJellyfin('recent.skipped_missing_config', {
			hasApiKey: Boolean(JELLYFIN_API_KEY),
			hasUser: Boolean(JELLYFIN_USER_ID),
		});
		return res.status(503).json({error: 'Jellyfin API key or user is not configured'});
	}
	try {
		const startedAt = Date.now();
		logJellyfin('recent.fetch_start', {userRef: maskIdentifier(JELLYFIN_USER_ID)});

		const userId = await getResolvedUserId();
		if (!userId) {
			logJellyfin('recent.fetch_failed_user_resolve', {userRef: maskIdentifier(JELLYFIN_USER_ID)});
			return res.status(502).json({error: 'Failed to resolve Jellyfin user ID'});
		}

		const response = await axios.get(
			`${JELLYFIN_URL}/Users/${userId}/Items/Latest`,
			{
				headers: jellyfinHeaders(),
				params: {
					Limit: 16,
					Fields: 'PrimaryImageAspectRatio',
					Recursive: true,
					IncludeItemTypes: 'Movie,Series,Episode',
					EnableImages: true,
					ImageTypeLimit: 1,
				},
			}
		);

		let items = mapItems(Array.isArray(response.data) ? response.data : response.data?.Items || []);

		if (!items.length) {
			logJellyfin('recent.latest_empty_fallback_start');
			const fallbackResponse = await axios.get(`${JELLYFIN_URL}/Users/${userId}/Items`, {
				headers: jellyfinHeaders(),
				params: {
					Limit: 16,
					Recursive: true,
					SortBy: 'DateCreated',
					SortOrder: 'Descending',
					IncludeItemTypes: 'Movie,Series,Episode',
					Fields: 'PrimaryImageAspectRatio,ProductionYear',
					ImageTypeLimit: 1,
					EnableImages: true,
				},
			});
			items = mapItems(fallbackResponse.data?.Items || []);
			logJellyfin('recent.latest_empty_fallback_done', {
				status: fallbackResponse.status,
				items: items.length,
			});
		}

		logJellyfin('recent.fetch_success', {
			status: response.status,
			items: items.length,
			durationMs: Date.now() - startedAt,
		});

		res.json(items);
	} catch (err) {
		console.error('Jellyfin recent error:', getErrorDetails(err));
		res.status(502).json({error: 'Failed to fetch recent items'});
	}
});

module.exports = router;
