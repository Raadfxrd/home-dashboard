const express = require('express');
const axios = require('axios');

const router = express.Router();

const HOMEBRIDGE_URL = process.env.HOMEBRIDGE_URL || 'http://localhost:8581';
const HB_USERNAME = process.env.HOMEBRIDGE_USERNAME || 'admin';
const HB_PASSWORD = process.env.HOMEBRIDGE_PASSWORD || 'admin';

let homebridgeToken = null;
let tokenExpiry = 0;
let tokenPromise = null;

async function getToken() {
  if (homebridgeToken && Date.now() < tokenExpiry) return homebridgeToken;
  if (tokenPromise) return tokenPromise;

  tokenPromise = axios
    .post(`${HOMEBRIDGE_URL}/api/auth/login`, {
      username: HB_USERNAME,
      password: HB_PASSWORD,
    })
    .then((res) => {
      homebridgeToken = res.data.access_token;
      tokenExpiry = Date.now() + (res.data.expires_in || 3600) * 1000 - 60000;
      return homebridgeToken;
    })
    .finally(() => {
      tokenPromise = null;
    });

  return tokenPromise;
}

const DEVICE_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;

function mockDevices() {
  return [
    {
      id: 'mock-1',
      name: 'Living Room Light',
      room: 'Living Room',
      type: 'light',
      state: true,
      brightness: 80,
    },
    {
      id: 'mock-2',
      name: 'Floor Lamp',
      room: 'Living Room',
      type: 'light',
      state: false,
      brightness: 0,
    },
    {
      id: 'mock-3',
      name: 'Bedroom Light',
      room: 'Bedroom',
      type: 'light',
      state: true,
      brightness: 50,
    },
    {
      id: 'mock-4',
      name: 'Desk Lamp',
      room: 'Bedroom',
      type: 'light',
      state: false,
      brightness: 0,
    },
    {
      id: 'mock-5',
      name: 'TV Plug',
      room: 'Living Room',
      type: 'switch',
      state: true,
      brightness: null,
    },
    {
      id: 'mock-6',
      name: 'Kitchen Light',
      room: 'Kitchen',
      type: 'light',
      state: false,
      brightness: 0,
    },
    {
      id: 'mock-7',
      name: 'Coffee Machine',
      room: 'Kitchen',
      type: 'switch',
      state: false,
      brightness: null,
    },
  ];
}

function groupByRoom(devices) {
  return devices.reduce((acc, device) => {
    if (!acc[device.room]) acc[device.room] = [];
    acc[device.room].push(device);
    return acc;
  }, {});
}

async function fetchHomebridgeDevices() {
  const token = await getToken();
  const res = await axios.get(`${HOMEBRIDGE_URL}/api/accessories`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.data.map((acc) => {
    const onChar = acc.serviceCharacteristics?.find((c) => c.type === 'On');
    const brightnessChar = acc.serviceCharacteristics?.find((c) => c.type === 'Brightness');
    const room = acc.room?.name || 'Other';
    const type = acc.type?.toLowerCase().includes('light') ? 'light' : 'switch';

    return {
      id: acc.uniqueId,
      name: acc.serviceName,
      room,
      type,
      state: onChar ? Boolean(onChar.value) : false,
      brightness: brightnessChar ? Number(brightnessChar.value) : null,
    };
  });
}

router.get('/devices', async (_req, res) => {
  try {
    const devices = await fetchHomebridgeDevices();
    res.json(groupByRoom(devices));
  } catch (err) {
    console.warn('Homebridge unavailable, returning mock data:', err.message);
    res.json(groupByRoom(mockDevices()));
  }
});

router.post('/toggle', async (req, res) => {
  const { deviceId, state } = req.body;
  if (deviceId === undefined || state === undefined) {
    return res.status(400).json({ error: 'deviceId and state are required' });
  }

  if (!DEVICE_ID_PATTERN.test(String(deviceId))) {
    return res.status(400).json({ error: 'Invalid deviceId format' });
  }

  if (deviceId.startsWith('mock-')) {
    return res.json({ success: true, deviceId, state });
  }

  try {
    const token = await getToken();
    await axios.put(
      `${HOMEBRIDGE_URL}/api/accessories/${deviceId}`,
      { characteristicType: 'On', value: state },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json({ success: true, deviceId, state });
  } catch (err) {
    console.error('Toggle error:', err.message);
    res.status(502).json({ error: 'Failed to toggle device' });
  }
});

module.exports = router;
