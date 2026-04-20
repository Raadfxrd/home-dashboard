const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');

const router = express.Router();
const cache = new NodeCache({ stdTTL: 600 });

const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

function formatWeather(data) {
  return {
    city: data.name,
    temperature: Math.round(data.main.temp),
    condition: data.weather[0].description,
    icon: data.weather[0].icon,
    humidity: data.main.humidity,
    windSpeed: Math.round(data.wind.speed * 3.6),
  };
}

async function fetchWeatherByCity(city) {
  const cacheKey = `city_${city.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const response = await axios.get(BASE_URL, {
    params: { q: city, appid: API_KEY, units: 'metric' },
  });
  const result = formatWeather(response.data);
  cache.set(cacheKey, result);
  return result;
}

async function fetchWeatherByCoords(lat, lon) {
  const cacheKey = `coords_${Math.round(lat * 10)}_${Math.round(lon * 10)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const response = await axios.get(BASE_URL, {
    params: { lat, lon, appid: API_KEY, units: 'metric' },
  });
  const result = formatWeather(response.data);
  cache.set(cacheKey, result);
  return result;
}

router.get('/', async (req, res) => {
  try {
    const city = req.query.city || 'Amsterdam';
    if (!API_KEY) {
      return res.status(503).json({ error: 'OpenWeatherMap API key not configured' });
    }
    const weather = await fetchWeatherByCity(city);
    res.json(weather);
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
    const weather = await fetchWeatherByCoords(parseFloat(lat), parseFloat(lon));
    res.json(weather);
  } catch (err) {
    console.error('Weather (coords) fetch error:', err.message);
    res.status(502).json({ error: 'Failed to fetch weather data' });
  }
});

module.exports = router;
