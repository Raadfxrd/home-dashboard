import api from './useApi.js';

/**
 * Demo mode — serves plausible, moving data so the dashboard can be run and
 * judged without the homelab behind it. Enable with VITE_DEMO=1.
 *
 * Values drift between polls (CPU wanders, downloads advance, rates jitter)
 * because a dashboard that renders frozen numbers hides every timing and
 * alignment problem it has.
 */

const startedAt = Date.now();

function wander(seed, base, spread, periodSec = 40) {
	const t = (Date.now() - startedAt) / 1000;
	const a = Math.sin(t / periodSec + seed) * 0.6;
	const b = Math.sin(t / (periodSec * 0.37) + seed * 2.3) * 0.4;
	return Math.max(0, base + (a + b) * spread);
}

/* A poster stand-in: a muted duotone field with the title set into it, so the
   media rail can be judged on composition without shipping artwork. */
function poster(title, year, [c1, c2]) {
	const safe = String(title).replace(/[<>&]/g, '');
	const words = safe.split(' ');
	const lines = [];
	let line = '';
	for (const w of words) {
		if ((line + ' ' + w).trim().length > 13) {
			lines.push(line.trim());
			line = w;
		} else {
			line = `${line} ${w}`;
		}
	}
	if (line.trim()) lines.push(line.trim());

	const text = lines
		.slice(0, 4)
		.map(
			(l, i) =>
				`<text x="26" y="${330 + i * 34}" font-family="Instrument Sans,sans-serif" font-size="27" font-weight="600" letter-spacing="-0.8" fill="#ffffff" fill-opacity="0.93">${l}</text>`
		)
		.join('');

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
</linearGradient>
<linearGradient id="v" x1="0" y1="0.35" x2="0" y2="1">
<stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.72"/>
</linearGradient>
</defs>
<rect width="400" height="600" fill="url(#g)"/>
<circle cx="300" cy="150" r="110" fill="#fff" fill-opacity="0.07"/>
<circle cx="90" cy="250" r="60" fill="#fff" fill-opacity="0.05"/>
<rect width="400" height="600" fill="url(#v)"/>
${text}
<text x="26" y="${330 + Math.min(lines.length, 4) * 34 + 22}" font-family="Spline Sans Mono,monospace" font-size="17" fill="#ffffff" fill-opacity="0.55">${year}</text>
</svg>`;

	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const PALETTES = [
	['#2f4858', '#12202b'], ['#4a3c5c', '#1d1729'], ['#5c3a34', '#25150f'],
	['#334a3c', '#111f17'], ['#4c4433', '#1e1a11'], ['#35405c', '#141828'],
	['#573544', '#21121a'], ['#3d5250', '#15211f'], ['#503f2e', '#1f1710'],
	['#2c3f52', '#101a24'], ['#4a3350', '#1b1020'], ['#3f4a2e', '#171c10'],
];

function makeMedia(list, offset = 0) {
	return list.map(([title, year, subtitle], i) => ({
		id: `demo_${offset}_${i}`,
		title,
		year,
		subtitle,
		poster: poster(title, year, PALETTES[(i + offset) % PALETTES.length]),
		progress: i === 1 ? 64 : i === 5 ? 21 : 0,
		links: {jellyfin: '#'},
	}));
}

const SUGGESTED = makeMedia([
	['The Quiet Coast', '2024', 'Drama'], ['Northbound', '2023', 'Thriller'],
	['Paper Cities', '2025', 'Documentary'], ['Blue Hour', '2022', 'Drama'],
	['The Long Field', '2024', 'Mystery'], ['Salt and Iron', '2023', 'Action'],
	['Winter Light', '2021', 'Drama'], ['The Signal Room', '2025', 'Sci-fi'],
	['Harbour Lights', '2024', 'Romance'], ['Deep Water Bay', '2023', 'Thriller'],
], 0);

const SHOWS = makeMedia([
	['Low Tide', '2024', 'S2 · 8 episodes'], ['The Cartographer', '2023', 'S1 · 6 episodes'],
	['Station Eleven Road', '2025', 'S3 · 10 episodes'], ['Ash & Ember', '2022', 'S1 · 8 episodes'],
	['Nightwatch', '2024', 'S4 · 12 episodes'], ['The Orchard', '2023', 'S2 · 6 episodes'],
], 4);

const RECENT = makeMedia([
	['Silver Lining Road', '2025', 'Added today'], ['The Fifth Season', '2025', 'Added today'],
	['Undercurrent', '2024', 'Added yesterday'], ['Glasshouse', '2025', 'Added yesterday'],
	['The Tallest Trees', '2024', 'Added 2 days ago'], ['Meridian', '2023', 'Added 3 days ago'],
	['Cold Start', '2025', 'Added 3 days ago'], ['The Inland Sea', '2024', 'Added 4 days ago'],
], 8);

const LIBRARY = [...SUGGESTED, ...SHOWS, ...RECENT, ...makeMedia([
	['Anemone', '2022', 'Drama'], ['The Weather House', '2024', 'Comedy'],
	['Far Shore', '2021', 'Drama'], ['Crosswind', '2025', 'Thriller'],
	['The Second Hand', '2023', 'Mystery'], ['Lantern', '2024', 'Drama'],
	['Riverbed', '2022', 'Documentary'], ['Two Winters', '2025', 'Drama'],
	['The Night Post', '2023', 'Thriller'], ['Halfway House', '2024', 'Comedy'],
	['Low Country', '2021', 'Drama'], ['The Glasshouse Keeper', '2025', 'Mystery'],
], 2)].map((item, i) => ({...item, id: `lib_${i}`}));

function library(url) {
	const params = new URLSearchParams(url.split('?')[1] || '');
	if (params.get('all')) {
		const now = Date.now();
		const items = LIBRARY.map((item, i) => ({...item, sortName: item.title.replace(/^The /, ''), added: new Date(now - i * 36e5 * 7).toISOString()}));
		return {items, total: items.length, hasMore: false};
	}
	const start = Number(params.get('startIndex') || 0);
	const limit = Number(params.get('limit') || 48);
	const sortBy = params.get('sortBy') || 'title';
	const desc = (params.get('sortOrder') || 'asc') === 'desc';

	const sorted = [...LIBRARY].sort((a, b) => {
		if (sortBy === 'year') return Number(a.year) - Number(b.year);
		if (sortBy === 'added') return 0;
		return a.title.localeCompare(b.title);
	});
	if (desc) sorted.reverse();

	return {
		items: sorted.slice(start, start + limit),
		total: sorted.length,
		hasMore: start + limit < sorted.length,
	};
}

const TORRENTS = [
	{id: 't1', name: 'Paper.Cities.2025.2160p.WEB-DL.DV.HDR', base: 62, speed: 11.4e6, state: 'downloading'},
	{id: 't2', name: 'Low.Tide.S02E05.1080p.WEB-DL', base: 31, speed: 4.2e6, state: 'downloading'},
	{id: 't3', name: 'The.Signal.Room.2025.1080p.BluRay.x265', base: 88, speed: 18.9e6, state: 'downloading'},
	{id: 't4', name: 'Nightwatch.S04.COMPLETE.1080p', base: 0, speed: 0, state: 'queued'},
	{id: 't5', name: 'Meridian.2023.2160p.REMUX', base: 47, speed: 0, state: 'stalledDL'},
];

function downloads() {
	const elapsed = (Date.now() - startedAt) / 1000;
	return TORRENTS.map((t, i) => {
		const running = t.state === 'downloading';
		const progress = running ? Math.min(99, t.base + elapsed * (0.35 + i * 0.05)) : t.base;
		const speed = running ? wander(i, t.speed, t.speed * 0.3, 18) : 0;
		return {
			id: t.id,
			name: t.name,
			state: t.state,
			progress: Math.round(progress * 10) / 10,
			speedBytesPerSecond: Math.round(speed),
			etaSeconds: running && speed > 0 ? Math.round(((100 - progress) / 100) * 14e9 / speed) : null,
		};
	});
}

function servicesStatus() {
	const rx = wander(1, 22e6, 14e6, 25);
	const tx = wander(4, 3.4e6, 2.6e6, 31);
	const totalDisk = 8 * 1024 ** 4;
	const usedDisk = totalDisk * 0.713;
	const totalRam = 16 * 1024 ** 3;
	const usedRam = totalRam * (wander(7, 47, 9, 55) / 100);

	return {
		indexers: {configured: true, online: true, total: 6, enabled: 6, onlineCount: 5, items: [
			{id: 'i1', name: 'Indexer A', online: true}, {id: 'i2', name: 'Indexer B', online: true},
			{id: 'i3', name: 'Indexer C', online: true}, {id: 'i4', name: 'Indexer D', online: true},
			{id: 'i5', name: 'Indexer E', online: true}, {id: 'i6', name: 'Indexer F', online: false, error: 'Query limit reached'},
		]},
		downloadClients: {configured: true, online: true, total: 2, enabled: 2, onlineCount: 2, items: [
			{id: 'qbittorrent', name: 'qBittorrent', enabled: true, online: true}, {id: 'nzbget', name: 'NZBGet', enabled: true, online: true},
		]},
		downloadActivity: {
			configured: true, online: true, total: 2, enabled: 2, onlineCount: 2,
			items: [
				{id: 'c1', name: 'qBittorrent', online: true, downloads: downloads()},
				{id: 'c2', name: 'SABnzbd', online: true, downloads: [
					{id: 'n1', name: 'Harbour.Lights.2024.1080p.WEB', state: 'downloading', progress: Math.round(wander(9, 74, 12, 30)), speedBytesPerSecond: Math.round(wander(3, 8.1e6, 2e6, 22)), etaSeconds: 420},
				]},
			],
		},
		nasMetrics: {
			configured: true, online: true, source: 'snmp', label: 'ASUSTOR', hostName: 'Steven', uptimeSeconds: 12 * 86400 + 5 * 3600,
			cpu: {usagePercent: Math.round(wander(2, 18, 12, 20))},
			memory: {totalBytes: totalRam, usedBytes: Math.round(usedRam), freeBytes: Math.round(totalRam - usedRam), usedPercent: Math.round((usedRam / totalRam) * 100)},
			disk: {totalBytes: totalDisk, usedBytes: usedDisk, freeBytes: totalDisk - usedDisk, usedPercent: 71, volumes: []},
			network: {
				totalRxRateBytesPerSecond: Math.round(rx),
				totalTxRateBytesPerSecond: Math.round(tx),
				interfaces: [
					{name: 'eth0', rxRateBytesPerSecond: Math.round(rx * 0.82), txRateBytesPerSecond: Math.round(tx * 0.78)},
					{name: 'eth1', rxRateBytesPerSecond: Math.round(rx * 0.18), txRateBytesPerSecond: Math.round(tx * 0.22)},
				],
			},
		},
		nasUsage: {configured: true, online: true, label: 'Volume1', path: '/volume1', totalBytes: totalDisk, usedBytes: usedDisk, freeBytes: totalDisk - usedDisk, usedPercent: 71},
		prowlarr: {configured: true, online: true},
		indexer: {configured: true, online: true},
		downloadClient: {configured: true, online: true},
	};
}

/* ?weather=rain|heavy|drizzle|storm|snow|sleet|fog|clouds|clear previews each
   backdrop in demo mode. */
const WEATHER_PRESETS = {
	clear: {conditionId: 800, icon: '01n', condition: 'clear sky'},
	clouds: {conditionId: 804, icon: '04n', condition: 'overcast clouds'},
	drizzle: {conditionId: 301, icon: '09n', condition: 'drizzle'},
	rain: {conditionId: 500, icon: '10n', condition: 'light rain'},
	heavy: {conditionId: 502, icon: '10n', condition: 'heavy rain'},
	storm: {conditionId: 211, icon: '11n', condition: 'thunderstorm'},
	snow: {conditionId: 601, icon: '13n', condition: 'snow'},
	sleet: {conditionId: 611, icon: '13n', condition: 'sleet'},
	fog: {conditionId: 741, icon: '50n', condition: 'fog'},
};
const presetName = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('weather') : null;
const preset = WEATHER_PRESETS[presetName] || WEATHER_PRESETS.rain;

const WEATHER = {
	Amsterdam: {
		city: 'Amsterdam', temperature: 12, feelsLike: 10, humidity: 84, windSpeed: 19, windDirection: 'SW',
		sunrise: '08:04', sunset: '18:41', lat: 52.37, lon: 4.89, ...preset,
	},
	local: {city: 'Rotterdam', temperature: 13, feelsLike: 11, condition: 'broken clouds', icon: '04d', conditionId: 803, humidity: 76, windSpeed: 15},
};

function demoOutlook() {
	const raining = ['rain', 'heavy', 'drizzle', 'storm', null, undefined].includes(presetName);
	const shape = presetName === 'heavy' || presetName === 'storm'
		? [2.4, 3.1, 4.2, 5, 3.8, 2.6, 1.8, 1.2, 0.8, 0.5, 0.3, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.5, 0.9, 0.7, 0.4, 0.2, 0, 0, 0]
		: [0, 0, 0, 0, 0, 0.1, 0.3, 0.6, 0.9, 1.2, 1.4, 1.1, 0.8, 0.6, 0.4, 0.3, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.8, 1.6, 2.2, 1.5, 0.7, 0.2, 0];
	const now = new Date();
	const base = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
	const slots = shape.map((mm, i) => {
		const m = (base + i * 5) % 1440;
		return {time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, mm: raining ? mm : 0};
	});
	const firstWet = slots.findIndex((s) => s.mm >= 0.1);
	const lastWet = slots.length - 1 - [...slots].reverse().findIndex((s) => s.mm >= 0.1);
	const summary = firstWet === -1
		? 'Dry for the next two hours'
		: firstWet === 0
			? `Heavy rain until about ${slots[lastWet + 1].time}`
			: `Light rain from about ${slots[firstWet].time}, dry again by ${slots[lastWet + 1].time}`;
	const h = (n) => `${String((Math.floor(base / 60) + 3 * n) % 24).padStart(2, '0')}:00`;
	const dayMm = raining ? [0.4, 1.1, 0.2, 0, 0, 0, 0.6, 0.3] : [0, 0, 0, 0, 0, 0, 0, 0];
	const startHour = (Math.floor(base / 60) + 3) % 24;
	const firstAt = new Date();
	firstAt.setHours(Math.floor(base / 60) + 3, 0, 0, 0);
	const temps = [11, 10, 11, 14, 15, 13, 12, 11];
	const icons = ['10n', '04n', '04d', '02d', '01d', '03d', '10n', '04n'];
	const blocks = temps.map((t, n) => ({
		time: `${String((startHour + 3 * n) % 24).padStart(2, '0')}:00`,
		at: firstAt.getTime() + n * 3 * 3600000,
		temperature: t, feelsLike: t - 2, humidity: 82 - n * 3,
		icon: icons[n], conditionId: icons[n].startsWith('10') ? 500 : icons[n].startsWith('01') ? 800 : 803,
		condition: icons[n].startsWith('10') ? 'light rain' : icons[n].startsWith('01') ? 'clear sky' : 'broken clouds',
		rainChance: [70, 20, 10, 0, 0, 10, 60, 40][n], mm: dayMm[n], snow: false,
		windSpeed: 19 + n, windGust: 34 + n * 2, windDirection: 'SW', clouds: icons[n].startsWith('01') ? 5 : 75,
		visibilityKm: 10, daylight: icons[n].endsWith('d'),
	}));
	const dayChance = raining ? [80, 90, 50, 10, 0, 10, 60, 40] : [0, 0, 10, 0, 0, 0, 10, 0];
	return {
		rain: {available: true, slots, summary},
		day: dayMm.map((mm, n) => ({time: h(n), mm, rainChance: dayChance[n]})),
		hours: blocks.slice(0, 5),
		blocks,
	};
}

/* A believable hour or day of NAS history: a quiet baseline, one busy spell,
   and network bursts while downloads run. Deterministic per range. */
function systemHistory(range) {
	const day = range === '24h';
	const step = day ? 300000 : 10000;
	const to = Date.now();
	const from = to - (day ? 86400000 : 3600000);
	let seed = day ? 7 : 3;
	const rnd = () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647;
	};
	const points = [];
	let cpu = 16;
	for (let t = from + step; t <= to; t += step) {
		const f = (t - from) / (to - from);
		cpu += (16 - cpu) * 0.15 + (rnd() - 0.5) * 8;
		const spike = 58 * Math.exp(-(((f - 0.6) / 0.025) ** 2));
		const rx = (14 + 9 * Math.sin(f * 9) + 18 * Math.exp(-(((f - 0.33) / 0.06) ** 2)) + (rnd() - 0.5) * 6) * 1e6;
		const tx = (2.4 + 1.2 * Math.sin(f * 5 + 1) + 5 * Math.exp(-(((f - 0.5) / 0.03) ** 2)) + (rnd() - 0.5)) * 1e6;
		points.push({t, cpu: Math.max(2, Math.min(100, Math.round(cpu + spike))), rx: Math.max(0, Math.round(rx)), tx: Math.max(0, Math.round(tx))});
	}
	const peak = points.reduce((a, p) => (p.cpu > a.cpu ? p : a), points[0]);
	return {
		range: day ? '24h' : '1h', stepSeconds: step / 1000, from, to, points,
		stats: {
			cpuAverage: Math.round(points.reduce((a, p) => a + p.cpu, 0) / points.length),
			cpuPeak: peak.cpu, cpuPeakAt: peak.t,
			rxPeak: Math.max(...points.map((p) => p.rx)), txPeak: Math.max(...points.map((p) => p.tx)),
		},
	};
}

/* Now playing, this week's releases, containers and the log, for demo mode.
   ?idle=1 shortens the idle timeout to 5 seconds to preview idle mode. */
function demoNowPlaying() {
	const show = SHOWS[1] || SUGGESTED[0];
	return {configured: true, sessions: [
		{id: 'np1', user: 'Borys', device: 'Apple TV', client: 'Infuse', title: show.title, subtitle: 'S02E05 · The Return', poster: show.poster, progress: 37.5, positionSeconds: 1290, runtimeSeconds: 3440, paused: false, playMethod: 'DirectPlay', ip: '192.168.2.3', network: 'local', url: '#',
			details: {overview: 'A mapmaker returns to the coast she charted as a child, and finds the shoreline no longer matches her maps.', genres: ['Drama', 'Mystery'], rating: 8.1, certification: '12', video: '4K · HEVC · Dolby Vision', audio: 'English - Dolby Atmos', subtitles: 'Off', bitrateMbps: null, transcodeReasons: [], videoDirect: true, audioDirect: true, hardware: null, app: 'Infuse 8.1'}},
		{id: 'np2', user: 'Emile', device: 'iPhone', client: 'Swiftfin', title: SUGGESTED[2].title, subtitle: '2024', poster: SUGGESTED[2].poster, progress: 81, positionSeconds: 5600, runtimeSeconds: 6900, paused: true, playMethod: 'Transcode', ip: '100.103.201.24', network: 'tailscale', url: '#',
			details: {overview: 'Two architects compete to rebuild a city that was only ever drawn on paper.', genres: ['Drama'], rating: 7.4, certification: '16', video: '1080p · H264', audio: 'Dutch - AAC Stereo', subtitles: 'English - SRT', bitrateMbps: 6.2, transcodeReasons: ['the audio codec isn\'t supported by the player', 'the bitrate is above the player\'s limit'], videoDirect: true, audioDirect: false, hardware: 'vaapi', app: 'Swiftfin 1.3'}},
	]};
}

function demoUpcoming() {
	const day = (n, h = 21, m = 0) => {
		const d = new Date();
		d.setDate(d.getDate() + n);
		d.setHours(h, m, 0, 0);
		return d.toISOString();
	};
	const p = (i) => (LIBRARY[i] || LIBRARY[0]).poster;
	const items = [
		{id: 'u1', kind: 'episode', title: 'Low Tide', subtitle: 'S02E06 · Slack Water', at: day(0, 21), allDay: false, hasFile: false, poster: p(1),
			details: {overview: 'With the dyke inspection looming, Sanne finally reads the letters her father left behind.', network: 'NPO 1', runtimeMin: 52, genres: ['Drama'], app: 'Sonarr', link: '#'}},
		{id: 'u2', kind: 'episode', title: 'Northbound', subtitle: 'S01E04 · Crossing', at: day(0, 3), allDay: false, hasFile: true, poster: p(2)},
		{id: 'u3', kind: 'movie', title: 'Paper Cities', subtitle: 'Digital release · 2026', at: day(1, 0), allDay: true, hasFile: false, poster: p(3),
			details: {overview: 'Two architects compete to rebuild a city that was only ever drawn on paper.', studio: 'Northlight', runtimeMin: 118, genres: ['Drama', 'Romance'], certification: '12', releases: [{label: 'In cinemas', at: day(-40, 0)}, {label: 'Digital release', at: day(1, 0)}], app: 'Radarr', link: '#'}},
		{id: 'u4', kind: 'episode', title: 'The Cartographer', subtitle: 'S03E01 · New Ground', at: day(2, 22), allDay: false, hasFile: false, poster: p(4)},
		{id: 'u5', kind: 'episode', title: 'Station Eleven Road', subtitle: 'S01E08 · Signal', at: day(4, 20, 30), allDay: false, hasFile: false, poster: p(5)},
		{id: 'u6', kind: 'movie', title: 'The Long Field', subtitle: 'In cinemas · 2026', at: day(5, 0), allDay: true, hasFile: false, poster: p(6)},
	];
	// ?quiet=1 previews a week with nothing in it.
	if (new URLSearchParams(location.search).get('quiet')) {
		return {configured: {sonarr: true, radarr: true}, items: [], next: {...items[3], at: day(19, 21)}, lookahead: 60, failed: [], days: 7};
	}
	return {configured: {sonarr: true, radarr: true}, items, failed: [], days: 7};
}

function demoContainers() {
	const mb = (n) => Math.round(n * 1048576);
	const items = [
		['Jackett', 'exited', 'Exited (0) 2 hours ago', null, null],
		['FlareSolverr', 'running', 'Up 3 days', 5.8, 0.0],
		['home-dashboard', 'running', 'Up 2 hours (healthy)', 29.3, 2.6],
		['Jellyfin', 'running', 'Up 3 days', 140.8, 0.2],
		['LibreSpeed', 'running', 'Up 3 days', 5.7, 0],
		['PortainerCE', 'running', 'Up 3 days', 31.6, 0.1],
		['Prowlarr', 'running', 'Up 3 days', 119.9, 3.2],
		['qBittorrent', 'running', 'Up 3 days', 15.9, wander(11, 18, 8, 9)],
		['Radarr', 'running', 'Up 3 days', 77.9, 0.2],
		['Sonarr', 'running', 'Up 3 days', 148.2, 0.1],
		['TailScale', 'running', 'Up 3 days', 22.2, 0.7],
	].map(([name, state, status, mem, cpu], i) => ({
		id: `c${i}`, name, image: name.toLowerCase(), state, status,
		health: status.includes('healthy') ? 'healthy' : null,
		memoryBytes: mem == null ? null : mb(mem), cpuPercent: cpu == null ? null : Math.round(cpu * 10) / 10,
	}));
	return {configured: true, online: true, total: items.length, running: items.filter((c) => c.state === 'running').length, items, error: null};
}

let demoLogCleared = false;
function demoLog() {
	if (demoLogCleared) return {entries: [], clearedAt: Date.now()};
	const ago = (min) => Date.now() - min * 60000;
	return {clearedAt: 0, entries: [
		{id: 3, level: 'error', source: 'prowlarr', message: 'Indexer F: Query limit reached (HTTP 429)', count: 14, firstAt: ago(95), lastAt: ago(2)},
		{id: 2, level: 'warning', source: 'weather', message: 'Weather rain (3h) error, using the 2h feed: timeout of 8000ms exceeded', count: 1, firstAt: ago(38), lastAt: ago(38)},
		{id: 1, level: 'error', source: 'jellyfin', message: 'Jellyfin recent error: connect ECONNREFUSED 192.168.2.4:28096 (ECONNREFUSED)', count: 3, firstAt: ago(240), lastAt: ago(212)},
	]};
}

/* A believable today and tomorrow for the agenda and what-to-wear. */
function demoCalendar() {
	const at = (dayOffset, h, m = 0) => {
		const d = new Date();
		d.setDate(d.getDate() + dayOffset);
		d.setHours(h, m, 0, 0);
		return d.toISOString();
	};
	const now = new Date();
	const soon = new Date(now.getTime() + 2 * 3600000);
	soon.setMinutes(0, 0, 0);
	const events = [
		{id: 'e0', title: 'Rent due', start: at(0, 0), end: at(1, 0), allDay: true, out: false, location: null, calendar: 'Home'},
		{id: 'e1', title: 'Standup', start: at(0, 9, 30), end: at(0, 9, 45), allDay: false, out: false, location: 'https://teams.microsoft.com/l/meetup', calendar: 'Work'},
		{id: 'e2', title: 'Dentist', start: soon.toISOString(), end: new Date(soon.getTime() + 3600000).toISOString(), allDay: false, out: true, location: 'Grote Markt 2, Haarlem', calendar: 'Personal'},
		{id: 'e3', title: 'Dinner with Emile', start: at(0, 19), end: at(0, 21, 30), allDay: false, out: true, location: 'Restaurant ML, Haarlem', calendar: 'Personal'},
		{id: 'e4', title: 'Studio Dark Tech', start: at(1, 10), end: at(1, 16), allDay: false, out: true, location: 'Wibautstraat 2, Amsterdam', calendar: 'School'},
	];
	return {configured: true, online: true, calendars: ['Home', 'Work', 'Personal', 'School'], events, error: null};
}

function demoItem(url) {
	const id = url.split('/').pop().split('?')[0];
	const base = LIBRARY.find((i) => i.id === id) || LIBRARY[0];
	return {
		...base,
		tagline: 'Every map is a promise.',
		overview: 'A mapmaker returns to the coast she charted as a child, and finds the shoreline no longer matches her maps. What she uncovers rewrites her family history and the town that kept its secrets.',
		genres: ['Drama', 'Mystery'], rating: 7.8, certification: '12', runtimeMin: 124, studios: ['Northlight'],
		directors: ['Anna Visser'], cast: ['Lotte de Wit', 'Jonas Meier', 'Iris Bakker', 'Daan Smit'],
		played: false, progress: 35, url: '#',
	};
}

function match(url = '') {
	const path = url.split('?')[0];
	if (path === '/weather') return WEATHER.Amsterdam;
	if (path === '/weather/current') return WEATHER.local;
	if (path === '/weather/outlook') return demoOutlook();
	if (path === '/home/services-status') return servicesStatus();
	if (path === '/jellyfin/now-playing') return demoNowPlaying();
	if (path === '/upcoming') return demoUpcoming();
	if (path === '/calendar') return new URLSearchParams(location.search).get('nocal') ? {configured: false, events: []} : demoCalendar();
	if (path.startsWith('/jellyfin/item/')) return demoItem(path);
	if (path === '/containers') return demoContainers();
	if (path === '/logs') return demoLog();
	if (path === '/logs/clear') {
		demoLogCleared = true;
		return {ok: true};
	}
	if (path === '/home/system-history') return systemHistory(url.includes('range=24h') ? '24h' : '1h');
	if (path === '/jellyfin/suggested') return url.includes('type=shows') ? SHOWS : SUGGESTED;
	if (path === '/jellyfin/recent') return RECENT;
	if (path === '/jellyfin/library') return library(url);
	return null;
}

// ?slow=1 stretches every answer, to look at the loading placeholders.
const SLOW = typeof location !== 'undefined' && new URLSearchParams(location.search).get('slow') ? 12 : 1;

export function installDemoMode() {
	api.interceptors.request.use((config) => {
		const params = config.params
			? `?${new URLSearchParams(Object.entries(config.params).map(([k, v]) => [k, String(v)]))}`
			: '';
		const data = match(`${config.url}${config.url.includes('?') ? '' : params}`);
		if (data === null) return config;

		// Short, uneven delay so loading states are exercised honestly.
		config.adapter = () =>
			new Promise((resolve) => {
				setTimeout(
					() => resolve({data, status: 200, statusText: 'OK', headers: {}, config}),
					(120 + Math.random() * 260) * SLOW
				);
			});
		return config;
	});
}
