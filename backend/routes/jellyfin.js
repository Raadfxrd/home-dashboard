const express = require('express');
const axios = require('axios');

const router = express.Router();

const JELLYFIN_URL = process.env.JELLYFIN_URL || 'http://localhost:8096';
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY || '';
const JELLYFIN_USER_ID = process.env.JELLYFIN_USER_ID || '';
let resolvedUserId = null;

const SUGGESTED_TITLE_GROUPS = [
	['inception'],
	['interstellar'],
	['the dark knight'],
	['the dark knight rises'],
	['breaking bad'],
	['game of thrones'],
	['the office'],
	['the wire'],
	['true detective'],
	['the sopranos'],
	['silo'],
	['the batman'],
	['oppenheimer'],
	['dune'],
	['dune part two', 'dune part 2'],
	['blade runner 2049'],
	['the lord of the rings'],
	['the matrix'],
	['avatar'],
	['stranger things'],
	['the last of us'],
	['severance'],
	['house of the dragon'],
	['the bear'],
	['arcane'],
	['andor'],
	['foundation'],
];

const SUGGESTED_MAX_ITEMS = 18;
const SUGGESTED_MIN_SERIES = 5;

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

function normalizeTitle(value = '') {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isSeries(item) {
	return item?.Type === 'Series';
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

function buildDetailsUrl(itemId) {
	return `${JELLYFIN_URL}/web/index.html#!/details?id=${encodeURIComponent(itemId)}`;
}

function getProviderId(item, keys = []) {
	for (const key of keys) {
		const value = item?.ProviderIds?.[key];
		if (value) {
			return String(value);
		}
	}
	return null;
}

function buildTmdbUrl(item) {
	const tmdbId = getProviderId(item, ['Tmdb', 'TMDB', 'TheMovieDb']);
	if (!tmdbId) {
		return null;
	}

	const type = String(item?.Type || '').toLowerCase();
	const tmdbType = type === 'movie' ? 'movie' : 'tv';
	return `https://www.themoviedb.org/${tmdbType}/${encodeURIComponent(tmdbId)}`;
}

function buildExternalLinks(item) {
	const links = {
		jellyfin: buildDetailsUrl(item.Id),
	};

	const tmdbUrl = buildTmdbUrl(item);
	if (tmdbUrl) {
		links.tmdb = tmdbUrl;
	}

	const tvdbId = getProviderId(item, ['Tvdb', 'TVDB']);
	if (tvdbId) {
		links.tvdb = `https://thetvdb.com/dereferrer/series/${encodeURIComponent(tvdbId)}`;
	}

	return links;
}

function mapItem(item, progress = 0) {
	return {
		id: item.Id,
		title: item.Name,
		poster: buildPosterUrl(item.Id),
		url: buildDetailsUrl(item.Id),
		links: buildExternalLinks(item),
		type: item.Type,
		year: item.ProductionYear || null,
		progress,
	};
}

function normalizeRecentItem(item) {
	if (item?.Type !== 'Episode') {
		return mapItem(item, 0);
	}

	const seriesId = item.SeriesId || item.ParentId || item.Id;
	const seriesLikeItem = {
		...item,
		Id: seriesId,
		Name: item.SeriesName || item.Name,
		Type: 'Series',
	};
	return {
		id: seriesId,
		title: item.SeriesName || item.Name,
		poster: buildPosterUrl(seriesId),
		url: buildDetailsUrl(seriesId),
		links: buildExternalLinks(seriesLikeItem),
		type: 'Series',
		year: item.ProductionYear || null,
		progress: 0,
		_episodeName: item.Name,
	};
}

function mapItems(items = []) {
	return items.map((item) => mapItem(item, 0));
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


function pickSuggestedItems(items = []) {
	const normalizedItems = items.map((item) => ({
		item,
		normalizedTitle: normalizeTitle(item.Name || ''),
	}));

	const selected = [];
	const selectedIds = new Set();

	for (const aliases of SUGGESTED_TITLE_GROUPS) {
		const match = normalizedItems
			.find(({normalizedTitle, item}) => {
				if (!normalizedTitle || selectedIds.has(item.Id)) {
					return false;
				}
				return aliases.some((alias) => {
					const needle = normalizeTitle(alias);
					return normalizedTitle === needle || normalizedTitle.includes(needle) || needle.includes(normalizedTitle);
				});
			});

		if (match) {
			selected.push(match.item);
			selectedIds.add(match.item.Id);
		}
	}

	const selectedSeriesCount = selected.filter(isSeries).length;
	if (selectedSeriesCount < SUGGESTED_MIN_SERIES) {
		for (const {item} of normalizedItems.filter(({item}) => isSeries(item))) {
			if (selectedIds.has(item.Id)) {
				continue;
			}
			selected.push(item);
			selectedIds.add(item.Id);
			if (selected.filter(isSeries).length >= SUGGESTED_MIN_SERIES) {
				break;
			}
		}
	}

	for (const {item} of normalizedItems) {
		if (selected.length >= SUGGESTED_MAX_ITEMS) {
			break;
		}
		if (selectedIds.has(item.Id)) {
			continue;
		}
		selected.push(item);
		selectedIds.add(item.Id);
	}

	return selected.slice(0, SUGGESTED_MAX_ITEMS);
}

router.get('/suggested', async (_req, res) => {
	if (!JELLYFIN_API_KEY || !JELLYFIN_USER_ID) {
		logJellyfin('suggested.skipped_missing_config', {
			hasApiKey: Boolean(JELLYFIN_API_KEY),
			hasUser: Boolean(JELLYFIN_USER_ID),
		});
		return res.status(503).json({error: 'Jellyfin API key or user is not configured'});
	}

	try {
		const startedAt = Date.now();
		logJellyfin('suggested.fetch_start', {userRef: maskIdentifier(JELLYFIN_USER_ID)});

		const userId = await getResolvedUserId();
		if (!userId) {
			logJellyfin('suggested.fetch_failed_user_resolve', {userRef: maskIdentifier(JELLYFIN_USER_ID)});
			return res.status(502).json({error: 'Failed to resolve Jellyfin user ID'});
		}

		const response = await axios.get(`${JELLYFIN_URL}/Users/${userId}/Items`, {
			headers: jellyfinHeaders(),
			params: {
				Recursive: true,
				Limit: 800,
				IncludeItemTypes: 'Movie,Series',
				Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds',
				SortBy: 'DateCreated',
				SortOrder: 'Descending',
				ImageTypeLimit: 1,
				EnableImages: true,
			},
		});

		const sourceItems = response.data?.Items || [];
		const suggested = mapItems(pickSuggestedItems(sourceItems));

		logJellyfin('suggested.fetch_success', {
			status: response.status,
			libraryItems: sourceItems.length,
			suggestedItems: suggested.length,
			durationMs: Date.now() - startedAt,
		});

		return res.json(suggested);
	} catch (err) {
		console.error('Jellyfin suggested error:', getErrorDetails(err));
		return res.status(502).json({error: 'Failed to fetch suggested watches'});
	}
});

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
					Fields: 'PrimaryImageAspectRatio,UserData,ProviderIds',
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
			return mapItem(item, progress);
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
					Fields: 'PrimaryImageAspectRatio,ProviderIds,SeriesId,SeriesName,ParentId',
					Recursive: true,
					IncludeItemTypes: 'Movie,Series,Episode',
					EnableImages: true,
					ImageTypeLimit: 1,
				},
			}
		);

		let items = (Array.isArray(response.data) ? response.data : response.data?.Items || []).map((item) => normalizeRecentItem(item));

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
					Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds,SeriesId,SeriesName,ParentId',
					ImageTypeLimit: 1,
					EnableImages: true,
				},
			});
			items = (fallbackResponse.data?.Items || []).map((item) => normalizeRecentItem(item));
			logJellyfin('recent.latest_empty_fallback_done', {
				status: fallbackResponse.status,
				items: items.length,
			});
		}

		const deduped = [];
		const seen = new Set();
		for (const item of items) {
			const key = item.type === 'Series' ? `series:${item.id}` : `movie:${item.id}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			deduped.push(item);
		}

		logJellyfin('recent.fetch_success', {
			status: response.status,
			items: deduped.length,
			durationMs: Date.now() - startedAt,
		});

		res.json(deduped);
	} catch (err) {
		console.error('Jellyfin recent error:', getErrorDetails(err));
		res.status(502).json({error: 'Failed to fetch recent items'});
	}
});

router.get('/library', async (req, res) => {
	if (!JELLYFIN_API_KEY || !JELLYFIN_USER_ID) {
		return res.status(503).json({error: 'Jellyfin API key or user is not configured'});
	}

	const typeParam = String(req.query.type || 'movies').toLowerCase();
	const includeItemTypes = typeParam === 'shows' ? 'Series' : 'Movie';
	const isShowQuery = typeParam === 'shows';
	const sortByParam = String(req.query.sortBy || 'title').toLowerCase();
	const sortOrderParam = String(req.query.sortOrder || 'asc').toLowerCase();
	const sortBy = ({
		title: 'SortName',
		year: 'ProductionYear,SortName',
		added: 'DateCreated',
	})[sortByParam] || 'SortName';
	const sortOrder = sortOrderParam === 'desc' ? 'Descending' : 'Ascending';
	const startIndex = Math.max(0, parseInt(req.query.startIndex || '0', 10) || 0);
	const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '48', 10) || 48));

	try {
		const userId = await getResolvedUserId();
		if (!userId) {
			return res.status(502).json({error: 'Failed to resolve Jellyfin user ID'});
		}

		const response = await axios.get(`${JELLYFIN_URL}/Users/${userId}/Items`, {
			headers: jellyfinHeaders(),
			params: {
				Recursive: true,
				StartIndex: startIndex,
				Limit: limit,
				SortBy: sortBy,
				SortOrder: sortOrder,
				IncludeItemTypes: includeItemTypes,
				ExcludeItemTypes: isShowQuery ? undefined : 'BoxSet,CollectionFolder',
				Filters: isShowQuery ? undefined : 'IsNotFolder',
				Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds',
				ImageTypeLimit: 1,
				EnableImages: true,
			},
		});

		const sourceItems = response.data?.Items || [];
		const total = response.data?.TotalRecordCount || sourceItems.length;
		const items = mapItems(sourceItems);

		res.json({
			items,
			total,
			startIndex,
			limit,
			hasMore: startIndex + items.length < total,
		});
	} catch (err) {
		console.error('Jellyfin library error:', getErrorDetails(err));
		res.status(502).json({error: 'Failed to fetch Jellyfin library'});
	}
});

module.exports = router;
