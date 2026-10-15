const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');

const router = express.Router();
const cache = new NodeCache({ stdTTL: 600 });

const API_KEY = process.env.OPENWEATHER_API_KEY;
const OWM = 'https://api.openweathermap.org/data/2.5';
// Buienradar's 2-hour rain outlook for a point: "value|HH:MM" lines, one
// every 5 minutes. Free, no key, and very good for the Netherlands.
const BUIENRADAR_RAINTEXT = process.env.BUIENRADAR_RAINTEXT_URL || 'https://gpsgadget.buienradar.nl/data/raintext';
const HTTP_TIMEOUT_MS = 8000;

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function compass(deg) {
  if (!Number.isFinite(deg)) return null;
  return COMPASS[Math.round(deg / 45) % 8];
}

/* OpenWeather gives UTC seconds plus the location's offset; format in that
   location's own clock rather than the server's. */
function localTime(unixSeconds, offsetSeconds = 0) {
  if (!Number.isFinite(unixSeconds)) return null;
  const d = new Date((unixSeconds + offsetSeconds) * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function formatWeather(data) {
  const w = data.weather?.[0] || {};
  return {
    city: data.name,
    temperature: Math.round(data.main.temp),
    feelsLike: Number.isFinite(data.main.feels_like) ? Math.round(data.main.feels_like) : null,
    condition: w.description,
    conditionId: w.id ?? null,
    icon: w.icon,
    humidity: data.main.humidity,
    windSpeed: Math.round(data.wind.speed * 3.6),
    windDirection: compass(data.wind?.deg),
    sunrise: localTime(data.sys?.sunrise, data.timezone),
    sunset: localTime(data.sys?.sunset, data.timezone),
    lat: data.coord?.lat ?? null,
    lon: data.coord?.lon ?? null,
  };
}

function locationParams(query) {
  const lat = parseFloat(query.lat);
  const lon = parseFloat(query.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { params: { lat, lon }, key: `${lat.toFixed(2)}_${lon.toFixed(2)}` };
  }
  const city = String(query.city || 'Amsterdam');
  return { params: { q: city }, key: city.toLowerCase() };
}

async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = await load();
  cache.set(key, value, ttl);
  return value;
}

async function fetchCurrent(loc) {
  return cached(`now_${loc.key}`, 600, async () => {
    const response = await axios.get(`${OWM}/weather`, {
      params: { ...loc.params, appid: API_KEY, units: 'metric' },
      timeout: HTTP_TIMEOUT_MS,
    });
    return formatWeather(response.data);
  });
}

async function fetchHours(loc) {
  return cached(`hours_${loc.key}`, 1200, async () => {
    const response = await axios.get(`${OWM}/forecast`, {
      params: { ...loc.params, appid: API_KEY, units: 'metric', cnt: 5 },
      timeout: HTTP_TIMEOUT_MS,
    });
    const offset = response.data?.city?.timezone ?? 0;
    return (response.data?.list || []).slice(0, 5).map((entry) => ({
      time: localTime(entry.dt, offset),
      temperature: Math.round(entry.main?.temp),
      icon: entry.weather?.[0]?.icon || null,
      conditionId: entry.weather?.[0]?.id ?? null,
      condition: entry.weather?.[0]?.description || null,
      rainChance: Number.isFinite(entry.pop) ? Math.round(entry.pop * 100) : null,
    }));
  });
}

/* Buienradar values are a log scale: mm/h = 10^((value - 109) / 32). */
function parseRainText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [raw, time] = line.split('|');
      const value = Number(raw);
      if (!Number.isFinite(value) || !time) return null;
      const mm = value <= 0 ? 0 : Math.pow(10, (value - 109) / 32);
      return { time: time.trim(), mm: Math.round(mm * 100) / 100 };
    })
    .filter(Boolean);
}

const WET = 0.1; // mm/h below this reads as dry

function describeRain(slots) {
  if (!slots.length) return null;
  const wet = slots.map((s) => s.mm >= WET);
  const peak = Math.max(...slots.map((s) => s.mm));
  const strength = peak < 1 ? 'Light rain' : peak < 4 ? 'Rain' : 'Heavy rain';

  if (!wet.some(Boolean)) return 'Dry for the next two hours';

  // The first moment it stays dry for at least two slots in a row.
  const dryAgainFrom = (start) => {
    for (let i = start; i < slots.length - 1; i += 1) {
      if (!wet[i] && !wet[i + 1]) return i;
    }
    return wet[slots.length - 1] ? -1 : slots.length - 1;
  };

  if (wet[0]) {
    const end = dryAgainFrom(1);
    return end === -1 ? `${strength} for the next two hours` : `${strength} until about ${slots[end].time}`;
  }

  const start = wet.indexOf(true);
  const end = dryAgainFrom(start + 1);
  return end === -1
    ? `${strength} from about ${slots[start].time}`
    : `${strength} from about ${slots[start].time}, dry again by ${slots[end].time}`;
}

async function fetchRain(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { available: false, slots: [], summary: null };
  return cached(`rain_${lat.toFixed(2)}_${lon.toFixed(2)}`, 300, async () => {
    const response = await axios.get(BUIENRADAR_RAINTEXT, {
      params: { lat: lat.toFixed(2), lon: lon.toFixed(2) },
      timeout: HTTP_TIMEOUT_MS,
      responseType: 'text',
    });
    const slots = parseRainText(response.data).slice(0, 24);
    return { available: slots.length > 0, slots, summary: describeRain(slots) };
  });
}

router.get('/', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({ error: 'OpenWeatherMap API key not configured' });
    }
    res.json(await fetchCurrent(locationParams({ city: req.query.city || 'Amsterdam' })));
  } catch (err) {
    console.error('Weather fetch error:', err.message);
    res.status(502).json({ error: 'Failed to fetch weather data' });
  }
});

router.get('/current', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ error: 'lat and lon query params are required' });
    }
    if (!API_KEY) {
      return res.status(503).json({ error: 'OpenWeatherMap API key not configured' });
    }
    res.json(await fetchCurrent(locationParams({ lat, lon })));
  } catch (err) {
    console.error('Weather (coords) fetch error:', err.message);
    res.status(502).json({ error: 'Failed to fetch weather data' });
  }
});

/* Everything below the current reading: the next 12 hours in 3-hour steps
   and the rain outlook for the next 2 hours. Each half fails on its own. */
router.get('/outlook', async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({ error: 'OpenWeatherMap API key not configured' });
  }
  const loc = locationParams(req.query);

  let current = null;
  try {
    current = await fetchCurrent(loc);
  } catch (err) {
    console.error('Weather outlook (current) error:', err.message);
  }

  const lat = Number.isFinite(parseFloat(req.query.lat)) ? parseFloat(req.query.lat) : current?.lat;
  const lon = Number.isFinite(parseFloat(req.query.lon)) ? parseFloat(req.query.lon) : current?.lon;

  const [hours, rain] = await Promise.all([
    fetchHours(loc).catch((err) => {
      console.error('Weather outlook (hours) error:', err.message);
      return [];
    }),
    fetchRain(lat, lon).catch((err) => {
      console.error('Weather outlook (rain) error:', err.message);
      return { available: false, slots: [], summary: null };
    }),
  ]);

  res.json({ hours, rain });
});

router._test = { parseRainText, describeRain };

module.exports = router;
