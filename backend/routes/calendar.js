const express = require('express');
const {createDAVClient} = require('tsdav');
const ical = require('node-ical');

/**
 * Today's and tomorrow's events from iCloud Calendar, read-only, so the
 * dashboard can dress you for the hours you're actually out.
 *
 * Signs in with an app-specific password (appleid.apple.com → Sign-In and
 * Security → App-Specific Passwords), never the Apple ID password. Each
 * event says whether it looks like somewhere you go (a timed event at a
 * real place) or not (online, or all day). Shown as the agenda under the
 * clock, and used for what-to-wear.
 */
const router = express.Router();

const USERNAME = process.env.ICLOUD_USERNAME || '';
const PASSWORD = process.env.ICLOUD_APP_PASSWORD || '';
const SERVER = process.env.ICLOUD_CALDAV_URL || 'https://caldav.icloud.com';
const ONLY = String(process.env.CALENDAR_NAMES || '')
	.split(',')
	.map((n) => n.trim().toLowerCase())
	.filter(Boolean);
const DAYS = Math.max(1, Math.min(14, Number(process.env.CALENDAR_DAYS || 7)));
const CACHE_MS = 10 * 60 * 1000;

// Calendars that are never about going somewhere.
const SKIP = /birthdays|verjaardagen|holidays|feestdagen|siri suggestions|reminders/i;
// Locations that are links or calls rather than places.
const ONLINE = /zoom|teams\.microsoft|meet\.google|webex|facetime|whereby|discord|https?:\/\/|\bonline\b|\bremote\b/i;

let cache = null;
let cachedAt = 0;
let inFlight = null;

function windowRange() {
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	const end = new Date(start.getTime() + DAYS * 86400000);
	return {start, end};
}

function clean(text) {
	return String(text?.val ?? text ?? '').replace(/\s+/g, ' ').trim();
}

/* Events from one calendar's iCalendar data. The server is asked to expand
   repeats; if it doesn't, the repeat rule is expanded here. */
function eventsFrom(data, calendarName, {start, end}) {
	const parsed = ical.sync.parseICS(data);
	const out = [];
	for (const ev of Object.values(parsed)) {
		if (ev.type !== 'VEVENT' || !ev.start) continue;
		const allDay = ev.datetype === 'date' || ev.start.dateOnly === true;
		const duration = (ev.end ? ev.end.getTime() : ev.start.getTime() + 3600000) - ev.start.getTime();
		const starts = ev.rrule
			? ev.rrule.between(new Date(start.getTime() - duration), end, true)
			: [ev.start];
		for (const s of starts) {
			const e = new Date(s.getTime() + duration);
			if (e <= start || s >= end) continue;
			const location = clean(ev.location);
			out.push({
				id: `${ev.uid || clean(ev.summary)}-${s.getTime()}`,
				title: clean(ev.summary) || 'Busy',
				start: s.toISOString(),
				end: e.toISOString(),
				location: location || null,
				allDay,
				// A timed event at a real place is time spent outside.
				out: !allDay && Boolean(location) && !ONLINE.test(location),
				calendar: calendarName,
			});
		}
	}
	return out;
}

async function load() {
	const client = await createDAVClient({
		serverUrl: SERVER,
		credentials: {username: USERNAME, password: PASSWORD},
		authMethod: 'Basic',
		defaultAccountType: 'caldav',
	});
	const range = windowRange();
	const calendars = (await client.fetchCalendars()).filter((cal) => {
		const name = clean(cal.displayName);
		const hasEvents = !cal.components || cal.components.includes('VEVENT');
		if (!hasEvents || SKIP.test(name)) return false;
		return ONLY.length ? ONLY.includes(name.toLowerCase()) : true;
	});

	const lists = await Promise.all(
		calendars.map(async (cal) => {
			try {
				const objects = await client.fetchCalendarObjects({
					calendar: cal,
					timeRange: {start: range.start.toISOString(), end: range.end.toISOString()},
					expand: true,
				});
				return objects.flatMap((o) => (o.data ? eventsFrom(o.data, clean(cal.displayName), range) : []));
			} catch (err) {
				console.warn('Calendar read error for', clean(cal.displayName), err.message);
				return [];
			}
		})
	);

	// The same event can come back once per instance and per calendar copy.
	const seen = new Set();
	const events = lists
		.flat()
		.filter((e) => (seen.has(e.id) ? false : seen.add(e.id)))
		.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

	return {
		configured: true,
		online: true,
		calendars: calendars.map((c) => clean(c.displayName)),
		from: range.start.toISOString(),
		to: range.end.toISOString(),
		events,
		error: null,
	};
}

function explain(err) {
	const status = err.response?.status || (/\b401\b/.test(err.message) ? 401 : null);
	if (status === 401 || /unauthori[sz]ed|invalid credentials/i.test(err.message)) {
		return 'Apple ID or app-specific password was rejected';
	}
	if (/ENOTFOUND|EAI_AGAIN/.test(err.code || err.message)) return 'can\'t reach iCloud (no internet?)';
	return err.message;
}

router.get('/', async (_req, res) => {
	if (!USERNAME || !PASSWORD) {
		return res.json({configured: false, online: false, events: [], calendars: [], error: null});
	}
	if (cache && Date.now() - cachedAt < CACHE_MS) return res.json(cache);
	try {
		inFlight = inFlight || load().finally(() => {
			inFlight = null;
		});
		cache = await inFlight;
		cachedAt = Date.now();
		res.json(cache);
	} catch (err) {
		const message = explain(err);
		console.error('iCloud calendar error:', message);
		// Keep showing the last good answer if there is one.
		res.json(cache ? {...cache, stale: true} : {configured: true, online: false, events: [], calendars: [], error: message});
	}
});

router._test = {eventsFrom};

module.exports = router;
