const express = require('express');
const axios = require('axios');

const router = express.Router();

const JELLYFIN_URL = process.env.JELLYFIN_URL || 'http://localhost:8096';
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY || '';
const JELLYFIN_USER_ID = process.env.JELLYFIN_USER_ID || '';

function jellyfinHeaders() {
  return {
    'X-Emby-Authorization': `MediaBrowser Token="${JELLYFIN_API_KEY}"`,
  };
}

function buildPosterUrl(itemId) {
  return `${JELLYFIN_URL}/Items/${itemId}/Images/Primary`;
}

router.get('/continue', async (_req, res) => {
  if (!JELLYFIN_API_KEY || !JELLYFIN_USER_ID) {
    return res.json([]);
  }
  try {
    const response = await axios.get(
      `${JELLYFIN_URL}/Users/${JELLYFIN_USER_ID}/Items/Resume`,
      {
        headers: jellyfinHeaders(),
        params: {
          Limit: 12,
          Fields: 'PrimaryImageAspectRatio,UserData',
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

    res.json(items);
  } catch (err) {
    console.error('Jellyfin continue error:', err.message);
    res.status(502).json({ error: 'Failed to fetch continue watching' });
  }
});

router.get('/recent', async (_req, res) => {
  if (!JELLYFIN_API_KEY || !JELLYFIN_USER_ID) {
    return res.json([]);
  }
  try {
    const response = await axios.get(
      `${JELLYFIN_URL}/Users/${JELLYFIN_USER_ID}/Items/Latest`,
      {
        headers: jellyfinHeaders(),
        params: {
          Limit: 16,
          Fields: 'PrimaryImageAspectRatio',
          EnableImages: true,
          ImageTypeLimit: 1,
        },
      }
    );

    const items = (response.data || []).map((item) => ({
      id: item.Id,
      title: item.Name,
      poster: buildPosterUrl(item.Id),
      type: item.Type,
      year: item.ProductionYear || null,
      progress: 0,
    }));

    res.json(items);
  } catch (err) {
    console.error('Jellyfin recent error:', err.message);
    res.status(502).json({ error: 'Failed to fetch recent items' });
  }
});

module.exports = router;
