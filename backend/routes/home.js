const express = require('express');
const axios = require('axios');

const router = express.Router();

const HOMEBRIDGE_URL = process.env.HOMEBRIDGE_URL || 'http://localhost:8581';
const HB_USERNAME = process.env.HOMEBRIDGE_USERNAME || 'admin';
const HB_PASSWORD = process.env.HOMEBRIDGE_PASSWORD || 'admin';

let homebridgeToken = null;
let tokenExpiry = 0;
let tokenPromise = null;

function logHomebridge(event, details = {}) {
	console.log('[Homebridge]', event, details);
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

function toBoolean(value) {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value > 0;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
	}
	return Boolean(value);
}

function normalizeRoomName(roomName) {
	const raw = String(roomName || '').trim();
	if (!raw) return 'Other';
	if (raw.toLowerCase() === 'other') return 'Other';
	return raw
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function hueSatToHex(hue, saturation) {
	const h = ((Number(hue) % 360) + 360) % 360;
	const s = clamp(Number(saturation) / 100, 0, 1);
	const v = 1;
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;

	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}

	const toHex = (channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function parseHexColor(hex) {
	if (typeof hex !== 'string' || !/^#?[0-9a-fA-F]{6}$/.test(hex)) {
		return null;
	}
	const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
	return {
		r: parseInt(normalized.slice(0, 2), 16),
		g: parseInt(normalized.slice(2, 4), 16),
		b: parseInt(normalized.slice(4, 6), 16),
	};
}

function rgbToHueSat({r, g, b}) {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const delta = max - min;

	let hue = 0;
	if (delta !== 0) {
		if (max === rn) {
			hue = 60 * (((gn - bn) / delta) % 6);
		} else if (max === gn) {
			hue = 60 * ((bn - rn) / delta + 2);
		} else {
			hue = 60 * ((rn - gn) / delta + 4);
		}
	}
	if (hue < 0) {
		hue += 360;
	}

	const saturation = max === 0 ? 0 : (delta / max) * 100;
	return {
		hue: Math.round(hue),
		saturation: Math.round(saturation),
	};
}

async function getToken() {
	if (homebridgeToken && Date.now() < tokenExpiry) return homebridgeToken;
	if (tokenPromise) return tokenPromise;

	logHomebridge('auth.login_start', {url: HOMEBRIDGE_URL});

	tokenPromise = axios
		.post(
			`${HOMEBRIDGE_URL}/api/auth/login`,
			{username: HB_USERNAME, password: HB_PASSWORD},
			{timeout: 5000}
		)
		.then((res) => {
			homebridgeToken = res.data.access_token;
			tokenExpiry = Date.now() + (res.data.expires_in || 3600) * 1000 - 60000;
			logHomebridge('auth.login_success', {expiresInSeconds: res.data.expires_in || 3600});
			return homebridgeToken;
		})
		.catch((err) => {
			logHomebridge('auth.login_error', getErrorDetails(err));
			throw err;
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
			supportsBrightness: true,
			supportsColor: true,
			hue: 30,
			saturation: 40,
			color: '#ffc680',
			canToggle: true,
		},
		{
			id: 'mock-2',
			name: 'Floor Lamp',
			room: 'Living Room',
			type: 'light',
			state: false,
			brightness: 0,
			supportsBrightness: true,
			supportsColor: true,
			hue: 210,
			saturation: 60,
			color: '#6699ff',
			canToggle: true,
		},
		{
			id: 'mock-3',
			name: 'Bedroom Light',
			room: 'Bedroom',
			type: 'light',
			state: true,
			brightness: 50,
			supportsBrightness: true,
			supportsColor: false,
			hue: null,
			saturation: null,
			color: null,
			canToggle: true,
		},
		{
			id: 'mock-4',
			name: 'Desk Lamp',
			room: 'Bedroom',
			type: 'light',
			state: false,
			brightness: 0,
			supportsBrightness: true,
			supportsColor: false,
			hue: null,
			saturation: null,
			color: null,
			canToggle: true,
		},
		{
			id: 'mock-5',
			name: 'TV Plug',
			room: 'Living Room',
			type: 'switch',
			state: true,
			brightness: null,
			supportsBrightness: false,
			supportsColor: false,
			hue: null,
			saturation: null,
			color: null,
			canToggle: true,
		},
		{
			id: 'mock-6',
			name: 'Kitchen Light',
			room: 'Kitchen',
			type: 'light',
			state: false,
			brightness: 0,
			supportsBrightness: true,
			supportsColor: true,
			hue: 120,
			saturation: 50,
			color: '#80ff80',
			canToggle: true,
		},
		{
			id: 'mock-7',
			name: 'Coffee Machine',
			room: 'Kitchen',
			type: 'switch',
			state: false,
			brightness: null,
			supportsBrightness: false,
			supportsColor: false,
			hue: null,
			saturation: null,
			color: null,
			canToggle: true,
		},
	];
}

function groupByRoom(devices) {
	return devices.reduce((acc, device) => {
		const roomName = normalizeRoomName(device.room);
		if (!acc[roomName]) acc[roomName] = [];
		acc[roomName].push({...device, room: roomName});
		return acc;
	}, {});
}

function resolveRoomName(acc) {
	return normalizeRoomName(
		acc.room?.name ||
		acc.roomName ||
		acc.context?.roomName ||
		acc.context?.room ||
		'Other'
	);
}

function hasCharacteristic(acc, type) {
	return Boolean(acc.serviceCharacteristics?.find((c) => c.type === type));
}

function isHiddenAccessory(acc) {
	const hiddenChar = acc.serviceCharacteristics?.find((c) => c.type === 'Hidden');
	return Boolean(
		toBoolean(acc.hidden) ||
		toBoolean(acc.isHidden) ||
		acc.visibility === 'hidden' ||
		toBoolean(hiddenChar?.value)
	);
}

function classifyAccessory(acc) {
	const source = `${acc.type || ''} ${acc.serviceName || ''}`.toLowerCase();
	if (source.includes('bridge')) return 'bridge';
	if (source.includes('remote')) return 'remote';
	if (source.includes('light')) return 'light';
	if (source.includes('switch') || source.includes('outlet')) return 'switch';
	if (source.includes('fan')) return 'fan';
	if (source.includes('thermostat')) return 'thermostat';
	if (source.includes('lock')) return 'lock';
	return 'sensor';
}

async function fetchHomebridgeDevices() {
	logHomebridge('accessories.fetch_start');
	const token = await getToken();
	const res = await axios.get(`${HOMEBRIDGE_URL}/api/accessories`, {
		headers: {Authorization: `Bearer ${token}`},
		timeout: 5000,
	});

	logHomebridge('accessories.fetch_success', {count: res.data.length});

	const mapped = res.data.map((acc) => {
		if (isHiddenAccessory(acc)) {
			logHomebridge('accessory.skipped_hidden', {id: acc.uniqueId, name: acc.serviceName});
			return null;
		}

		const onChar = acc.serviceCharacteristics?.find((c) => c.type === 'On');
		const brightnessChar = acc.serviceCharacteristics?.find((c) => c.type === 'Brightness');
		const hueChar = acc.serviceCharacteristics?.find((c) => c.type === 'Hue');
		const saturationChar = acc.serviceCharacteristics?.find((c) => c.type === 'Saturation');
		const room = resolveRoomName(acc);
		const type = classifyAccessory(acc);
		const supportsColor = Boolean(hueChar && saturationChar);
		const supportsBrightness = Boolean(brightnessChar);
		const hue = supportsColor ? Number(hueChar.value) : null;
		const saturation = supportsColor ? Number(saturationChar.value) : null;
		const canToggle = Boolean(onChar) && type !== 'bridge' && type !== 'remote';
		const isActionable = canToggle || supportsBrightness || supportsColor;

		if (!isActionable) {
			logHomebridge('accessory.skipped_non_actionable', {id: acc.uniqueId, name: acc.serviceName, type});
			return null;
		}

		return {
			id: acc.uniqueId,
			name: acc.serviceName,
			room,
			type,
			state: onChar ? toBoolean(onChar.value) : false,
			brightness: brightnessChar ? Number(brightnessChar.value) : null,
			supportsBrightness,
			supportsColor,
			hue,
			saturation,
			color: supportsColor ? hueSatToHex(hue, saturation) : null,
			canToggle,
		};
	});

	return mapped
		.filter(Boolean)
		.sort((a, b) => `${a.room}:${a.name}`.localeCompare(`${b.room}:${b.name}`));
}

async function setCharacteristic(deviceId, characteristicType, value) {
	const token = await getToken();
	const safeId = encodeURIComponent(deviceId);
	logHomebridge('accessory.characteristic_write_start', {
		deviceId,
		characteristicType,
		value,
	});

	await axios.put(
		`${HOMEBRIDGE_URL}/api/accessories/${safeId}`,
		{characteristicType, value},
		{headers: {Authorization: `Bearer ${token}`}}
	);

	logHomebridge('accessory.characteristic_write_success', {deviceId, characteristicType});
}

router.get('/devices', async (_req, res) => {
	try {
		const devices = await fetchHomebridgeDevices();
		res.json(groupByRoom(devices));
	} catch (err) {
		console.warn('Homebridge unavailable, returning mock data:', err.message);
		logHomebridge('accessories.fetch_fallback_mock', getErrorDetails(err));
		res.json(groupByRoom(mockDevices()));
	}
});

router.post('/toggle', async (req, res) => {
	const {deviceId, state} = req.body;
	if (deviceId === undefined || state === undefined) {
		return res.status(400).json({error: 'deviceId and state are required'});
	}

	if (!DEVICE_ID_PATTERN.test(String(deviceId))) {
		return res.status(400).json({error: 'Invalid deviceId format'});
	}

	if (deviceId.startsWith('mock-')) {
		return res.json({success: true, deviceId, state});
	}

	try {
		await setCharacteristic(deviceId, 'On', state);
		res.json({success: true, deviceId, state});
	} catch (err) {
		console.error('Toggle error:', err.message);
		logHomebridge('accessory.toggle_error', {deviceId, ...getErrorDetails(err)});
		res.status(502).json({error: 'Failed to toggle device'});
	}
});

router.post('/brightness', async (req, res) => {
	const {deviceId, brightness} = req.body;
	if (deviceId === undefined || brightness === undefined) {
		return res.status(400).json({error: 'deviceId and brightness are required'});
	}

	if (!DEVICE_ID_PATTERN.test(String(deviceId))) {
		return res.status(400).json({error: 'Invalid deviceId format'});
	}

	const normalized = clamp(Number(brightness), 0, 100);
	if (Number.isNaN(normalized)) {
		return res.status(400).json({error: 'brightness must be a number between 0 and 100'});
	}

	if (deviceId.startsWith('mock-')) {
		return res.json({success: true, deviceId, brightness: normalized});
	}

	try {
		await setCharacteristic(deviceId, 'Brightness', normalized);
		if (normalized > 0) {
			await setCharacteristic(deviceId, 'On', true);
		}
		res.json({success: true, deviceId, brightness: normalized});
	} catch (err) {
		logHomebridge('accessory.brightness_error', {deviceId, ...getErrorDetails(err)});
		res.status(502).json({error: 'Failed to set brightness'});
	}
});

router.post('/color', async (req, res) => {
	const {deviceId, color} = req.body;
	if (deviceId === undefined || color === undefined) {
		return res.status(400).json({error: 'deviceId and color are required'});
	}

	if (!DEVICE_ID_PATTERN.test(String(deviceId))) {
		return res.status(400).json({error: 'Invalid deviceId format'});
	}

	const rgb = parseHexColor(color);
	if (!rgb) {
		return res.status(400).json({error: 'color must be a hex value like #66ccff'});
	}

	const {hue, saturation} = rgbToHueSat(rgb);

	if (deviceId.startsWith('mock-')) {
		return res.json({success: true, deviceId, color: hueSatToHex(hue, saturation), hue, saturation});
	}

	try {
		await setCharacteristic(deviceId, 'Hue', hue);
		await setCharacteristic(deviceId, 'Saturation', saturation);
		await setCharacteristic(deviceId, 'On', true);
		res.json({success: true, deviceId, color: hueSatToHex(hue, saturation), hue, saturation});
	} catch (err) {
		logHomebridge('accessory.color_error', {deviceId, ...getErrorDetails(err)});
		res.status(502).json({error: 'Failed to set color'});
	}
});

module.exports = router;
