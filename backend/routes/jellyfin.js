const express = require('express');
const axios = require('axios');

const router = express.Router();

const JELLYFIN_URL = process.env.JELLYFIN_URL || 'http://localhost:8096';
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY || '';
const JELLYFIN_USER_ID = process.env.JELLYFIN_USER_ID || '';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_LANGUAGE = process.env.TMDB_LANGUAGE || 'en-US';
const SUGGESTED_MAX_ITEMS = process.env.SUGGESTED_MAX_ITEMS || '15';
let resolvedUserId = null;

function maskIdentifier(value) {
	if (!value) return 'missing';
	if (value.length <= 4) return '****';
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

function normalizeSeriesKey(item) {
	return item?.SeriesId || item?.ParentId || item?.Id || null;
}

function dedupeSeeds(items = []) {
	const seen = new Set();
	const result = [];
	for (const item of items) {
		const key = item?.Type === 'Episode' ? `series:${normalizeSeriesKey(item)}` : `item:${item?.Id}`;
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(item);
	}
	return result;
}

function isCollectionLike(item) {
	const type = String(item?.Type || '').toLowerCase();
	return type === 'boxset' || type === 'collectionfolder' || type === 'collection';
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

function buildExternalLinks(item) {
	return {jellyfin: buildDetailsUrl(item.Id)};
}

function buildSubtitle(item) {
	if (!item || item.Type !== 'Episode') return null;

	const season = Number(item.ParentIndexNumber);
	const episode = Number(item.IndexNumber);
	const hasSeason = Number.isFinite(season) && season >= 0;
	const hasEpisode = Number.isFinite(episode) && episode >= 0;

	if (hasSeason && hasEpisode) {
		return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
	}

	return null;
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
		subtitle: item.subtitle || null,
		progress,
	};
}

function normalizeRecentItem(item) {
	if (item?.Type !== 'Episode') return mapItem(item, 0);
	const seriesId = item.SeriesId || item.ParentId || item.Id;
	const seriesLikeItem = {...item, Id: seriesId, Name: item.SeriesName || item.Name, Type: 'Series'};
	return {
		id: seriesId,
		title: item.SeriesName || item.Name,
		poster: buildPosterUrl(seriesId),
		url: buildDetailsUrl(seriesId),
		links: buildExternalLinks(seriesLikeItem),
		type: 'Series',
		year: item.ProductionYear || null,
		subtitle: buildSubtitle(item),
		progress: 0,
		_episodeName: item.Name,
	};
}

function mapItems(items = []) {
	return items.map((item) => mapItem(item, 0));
}

async function fetchLatestEpisodeForSeries(userId, seriesId) {
	const response = await axios.get(`${JELLYFIN_URL}/Users/${userId}/Items`, {
		headers: jellyfinHeaders(),
		params: {
			ParentId: seriesId,
			Recursive: true,
			IncludeItemTypes: 'Episode',
			SortBy: 'DateCreated',
			SortOrder: 'Descending',
			Limit: 1,
			Fields: 'ParentIndexNumber,IndexNumber,Name',
		},
	});

	return response.data?.Items?.[0] || null;
}

async function fetchTmdbTrendingTitles() {
	if (!TMDB_API_KEY) return [];
	try {
		const [movies, shows] = await Promise.all([
			axios.get('https://api.themoviedb.org/3/trending/movie/week', {
				params: {
					api_key: TMDB_API_KEY,
					language: TMDB_LANGUAGE
				}
			}),
			axios.get('https://api.themoviedb.org/3/trending/tv/week', {
				params: {
					api_key: TMDB_API_KEY,
					language: TMDB_LANGUAGE
				}
			}),
		]);
		return [
			...(movies.data?.results || []).map((item) => ({title: item.title, type: 'Movie'})),
			...(shows.data?.results || []).map((item) => ({title: item.name, type: 'Series'})),
		];
	} catch (err) {
		logJellyfin('tmdb.trending_failed', getErrorDetails(err));
		return [];
	}
}

function scoreCandidate(item, historyGenres, tmdbTitles) {
	const genres = item.Genres || [];
	const genreHits = genres.reduce((score, genre) => score + (historyGenres.get(normalizeTitle(genre)) || 0), 0);
	const normalizedTitle = normalizeTitle(item.Name || '');
	const tmdbHit = tmdbTitles.some((entry) => normalizeTitle(entry.title) === normalizedTitle && entry.type === item.Type);
	return genreHits * 10 + (tmdbHit ? 8 : 0) + (item.UserData?.IsFavorite ? 2 : 0);
}

async function getResolvedUserId() {
	if (resolvedUserId) {
		logJellyfin('user.resolve.cache_hit', {userId: maskIdentifier(resolvedUserId)});
		return resolvedUserId;
	}

	if (!JELLYFIN_USER_ID) return null;

	if (/^[a-f0-9-]{32,36}$/i.test(JELLYFIN_USER_ID)) {
		resolvedUserId = JELLYFIN_USER_ID;
		logJellyfin('user.resolve.direct_id', {userId: maskIdentifier(resolvedUserId)});
		return resolvedUserId;
	}

	try {
		logJellyfin('user.resolve.me_start');
		const meResponse = await axios.get(`${JELLYFIN_URL}/Users/Me`, {headers: jellyfinHeaders()});
		if (meResponse.data?.Id) {
			resolvedUserId = meResponse.data.Id;
			logJellyfin('user.resolve.me_success', {userId: maskIdentifier(resolvedUserId)});
			return resolvedUserId;
		}
	} catch (err) {
		logJellyfin('user.resolve.me_failed', getErrorDetails(err));
	}

	logJellyfin('user.resolve.lookup_start', {username: maskIdentifier(JELLYFIN_USER_ID)});
	const response = await axios.get(`${JELLYFIN_URL}/Users`, {headers: jellyfinHeaders()});
	const match = (response.data || []).find((user) => user?.Name?.toLowerCase() === JELLYFIN_USER_ID.toLowerCase());
	if (!match?.Id) {
		logJellyfin('user.resolve.lookup_miss', {username: maskIdentifier(JELLYFIN_USER_ID)});
		return null;
	}

	resolvedUserId = match.Id;
	logJellyfin('user.resolve.lookup_success', {userId: maskIdentifier(resolvedUserId)});
	return resolvedUserId;
}


router.get('/suggested', async (req, res) => {
	if (!JELLYFIN_API_KEY || !JELLYFIN_USER_ID) {
		logJellyfin('suggested.skipped_missing_config', {
			hasApiKey: Boolean(JELLYFIN_API_KEY),
			hasUser: Boolean(JELLYFIN_USER_ID),
		});
		return res.status(503).json({error: 'Jellyfin API key or user is not configured'});
	}

	const typeParam = String(req.query.type || 'all').toLowerCase();
	const suggestionMode = typeParam === 'shows' ? 'shows' : typeParam === 'movies' ? 'movies' : 'all';
	const historyTypes = suggestionMode === 'shows' ? 'Episode' : 'Movie,Episode';
	const libraryTypes = suggestionMode === 'shows' ? 'Series' : suggestionMode === 'movies' ? 'Movie' : 'Movie,Series';
	const suggestedLimit = Math.max(1, parseInt(SUGGESTED_MAX_ITEMS, 10) || 15);

	try {
		const startedAt = Date.now();
		logJellyfin('suggested.fetch_start', {userRef: maskIdentifier(JELLYFIN_USER_ID), mode: suggestionMode});

		const userId = await getResolvedUserId();
		if (!userId) {
			logJellyfin('suggested.fetch_failed_user_resolve', {userRef: maskIdentifier(JELLYFIN_USER_ID)});
			return res.status(502).json({error: 'Failed to resolve Jellyfin user ID'});
		}

		const [historyResponse, libraryResponse, tmdbTitles] = await Promise.all([
			axios.get(`${JELLYFIN_URL}/Users/${userId}/Items`, {
				headers: jellyfinHeaders(),
				params: {
					Recursive: true,
					Limit: 60,
					IncludeItemTypes: historyTypes,
					Filters: 'IsPlayed',
					SortBy: 'DatePlayed',
					SortOrder: 'Descending',
					Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds,Genres,UserData,SeriesId,SeriesName,ParentId',
					ImageTypeLimit: 1,
					EnableImages: true,
				},
			}),
			axios.get(`${JELLYFIN_URL}/Users/${userId}/Items`, {
				headers: jellyfinHeaders(),
				params: {
					Recursive: true,
					Limit: 800,
					IncludeItemTypes: libraryTypes,
					ExcludeItemTypes: 'BoxSet,CollectionFolder',
					Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds,Genres,UserData',
					SortBy: 'DateCreated',
					SortOrder: 'Descending',
					ImageTypeLimit: 1,
					EnableImages: true,
				},
			}),
			fetchTmdbTrendingTitles(),
		]);

		const historyItems = dedupeSeeds((historyResponse.data?.Items || []).filter((item) => !isCollectionLike(item))).slice(0, 30);
		const libraryItems = (libraryResponse.data?.Items || [])
			.filter((item) => item?.UserData?.IsPlayed !== true)
			.filter((item) => !isCollectionLike(item));
		const scopedTmdbTitles = suggestionMode === 'shows'
			? tmdbTitles.filter((entry) => entry.type === 'Series')
			: suggestionMode === 'movies'
				? tmdbTitles.filter((entry) => entry.type === 'Movie')
				: tmdbTitles;
		const historyGenres = new Map();
		for (const item of historyItems) {
			for (const genre of item.Genres || []) {
				const key = normalizeTitle(genre);
				historyGenres.set(key, (historyGenres.get(key) || 0) + 1);
			}
		}

		const scored = libraryItems
			.map((item) => ({item, score: scoreCandidate(item, historyGenres, tmdbTitles)}))
			.sort((a, b) => b.score - a.score || String(a.item.Name || '').localeCompare(String(b.item.Name || '')));

		const selected = [];
		const seen = new Set();

		for (const {item} of scored) {
			if (selected.length >= suggestedLimit) break;
			const key = `${item.Type}:${item.Id}`;
			if (seen.has(key)) continue;
			selected.push(item);
			seen.add(key);
		}

		if (selected.length < suggestedLimit && scopedTmdbTitles.length) {
			for (const entry of scopedTmdbTitles) {
				if (selected.length >= suggestedLimit) break;
				const match = libraryItems.find((item) => {
					if (seen.has(`${item.Type}:${item.Id}`)) return false;
					return normalizeTitle(item.Name || '') === normalizeTitle(entry.title);
				});
				if (match) {
					selected.push(match);
					seen.add(`${match.Type}:${match.Id}`);
				}
			}
		}

		if (selected.length < suggestedLimit) {
			for (const {item} of scored) {
				if (selected.length >= suggestedLimit) break;
				const key = `${item.Type}:${item.Id}`;
				if (seen.has(key)) continue;
				selected.push(item);
				seen.add(key);
			}
		}

		const response = historyResponse;
		const suggested = mapItems(selected);

		logJellyfin('suggested.fetch_success', {
			status: response.status,
			mode: suggestionMode,
			historyItems: historyItems.length,
			libraryItems: libraryItems.length,
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
					Fields: 'PrimaryImageAspectRatio,ProviderIds,SeriesId,SeriesName,ParentId,ParentIndexNumber,IndexNumber',
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
					Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds,SeriesId,SeriesName,ParentId,ParentIndexNumber,IndexNumber',
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

		const dedupedByKey = new Map();
		for (const item of items) {
			const key = item.type === 'Series' ? `series:${item.id}` : `movie:${item.id}`;
			const existing = dedupedByKey.get(key);
			if (!existing || (!existing.subtitle && item.subtitle)) {
				dedupedByKey.set(key, item);
			}
		}
		const deduped = await Promise.all(
			Array.from(dedupedByKey.values()).map(async (item) => {
				if (item.type !== 'Series' || item.subtitle) {
					return item;
				}

				try {
					const latestEpisode = await fetchLatestEpisodeForSeries(userId, item.id);
					const subtitle = buildSubtitle(latestEpisode);
					return subtitle ? {...item, subtitle} : item;
				} catch (err) {
					logJellyfin('recent.series_subtitle_lookup_failed', {seriesId: item.id, ...getErrorDetails(err)});
					return item;
				}
			})
		);

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
