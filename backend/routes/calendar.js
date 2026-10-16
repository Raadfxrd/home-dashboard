const express = require('express');
const axios = require('axios');
const {createDAVClient} = require('tsdav');
const ical = require('node-ical');

/**
 * The coming week's events, read-only, so the dashboard can show your
 * agenda and dress you for the hours you're actually out. Two sources:
 *
 * - iCloud Calendar over CalDAV (your own and shared iCloud calendars).
 * - Calendar feeds (.ics links) for everything iCloud doesn't serve over
 *   CalDAV: subscribed calendars like a school timetable, and work
 *   calendars from Outlook/Exchange or Google that live on your Mac but
 *   not in iCloud. CALENDAR_ICS_URLS="School|webcal://…,Work|https://…"
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
const FEEDS = String(process.env.CALENDAR_ICS_URLS || '')
	.split(',')
	.map((entry) => entry.trim())
	.filter(Boolean)
	.map((entry, i) => {
		const bar = entry.indexOf('|');
		const name = bar > 0 ? entry.slice(0, bar).trim() : `Feed ${i + 1}`;
		const url = (bar > 0 ? entry.slice(bar + 1) : entry).trim().replace(/^webcals?:\/\//i, 'https://');
		return {name, url};
	});
const ICLOUD = Boolean(USERNAME && PASSWORD);

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

/* Events from one calendar's iCalendar data within the range. Repeats are
   expanded here (iCloud often ignores the request to expand them), with
   skipped dates (EXDATE) left out and moved or edited occurrences
   (RECURRENCE-ID) applied. */
function eventsFrom(data, calendarName, {start, end}) {
	const parsed = ical.sync.parseICS(data);
	const out = [];
	for (const ev of Object.values(parsed)) {
		if (ev.type !== 'VEVENT' || !ev.start) continue;
		if (String(ev.status || '').toUpperCase() === 'CANCELLED') continue;
		let instances;
		if (ev.rrule) {
			instances = ical.expandRecurringEvent(ev, {from: start, to: end, expandOngoing: true});
		} else {
			const s = ev.start;
			const e = ev.end || new Date(s.getTime() + (ev.datetype === 'date' ? 86400000 : 3600000));
			instances = [{start: s, end: e, summary: ev.summary, isFullDay: ev.datetype === 'date' || s.dateOnly === true, event: ev}];
		}
		for (const inst of instances) {
			const s = new Date(inst.start);
			const e = new Date(inst.end || s.getTime() + 3600000);
			if (e <= start || s >= end) continue;
			const source = inst.event || ev;
			if (String(source.status || '').toUpperCase() === 'CANCELLED') continue;
			const allDay = Boolean(inst.isFullDay);
			const location = clean(source.location);
			out.push({
				id: `${ev.uid || clean(ev.summary)}-${s.getTime()}`,
				title: clean(inst.summary ?? source.summary) || 'Busy',
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

/* iCloud over CalDAV. Returns one entry per calendar found, including the
   ones left out and why, so the dashboard can show what it reads. */
async function loadICloud(range) {
	const client = await createDAVClient({
		serverUrl: SERVER,
		credentials: {username: USERNAME, password: PASSWORD},
		authMethod: 'Basic',
		defaultAccountType: 'caldav',
	});
	const all = await client.fetchCalendars();
	return Promise.all(
		all.map(async (cal) => {
			const name = clean(cal.displayName) || 'Untitled';
			const entry = {name, source: 'iCloud', events: [], skipped: null, error: null};
			if (cal.components && !cal.components.includes('VEVENT')) entry.skipped = 'reminders only';
			else if (ONLY.length && !ONLY.includes(name.toLowerCase())) entry.skipped = 'not in CALENDAR_NAMES';
			else if (!ONLY.length && SKIP.test(name)) entry.skipped = 'birthdays or holidays';
			if (entry.skipped) return entry;
			try {
				const objects = await client.fetchCalendarObjects({
					calendar: cal,
					timeRange: {start: range.start.toISOString(), end: range.end.toISOString()},
					expand: true,
				});
				entry.events = objects.flatMap((o) => (o.data ? eventsFrom(o.data, name, range) : []));
			} catch (err) {
				entry.error = err.message;
				console.warn('Calendar read error for', name, err.message);
			}
			return entry;
		})
	);
}

/* .ics feeds: subscribed, Outlook/Exchange or Google calendars. */
async function loadFeeds(range) {
	return Promise.all(
		FEEDS.map(async (feed) => {
			const entry = {name: feed.name, source: 'feed', events: [], skipped: null, error: null};
			try {
				const res = await axios.get(feed.url, {timeout: 15000, responseType: 'text', maxContentLength: 20 * 1024 * 1024});
				entry.events = eventsFrom(String(res.data), feed.name, range);
			} catch (err) {
				const status = err.response?.status;
				entry.error = status ? `the link answered HTTP ${status}` : err.code === 'ENOTFOUND' ? 'address not found' : err.message;
				console.warn('Calendar feed error for', feed.name, entry.error);
			}
			return entry;
		})
	);
}

async function load() {
	const range = windowRange();
	let icloudError = null;
	const [icloud, feeds] = await Promise.all([
		ICLOUD
			? loadICloud(range).catch((err) => {
				icloudError = explain(err);
				console.error('iCloud calendar error:', icloudError);
				return [];
			})
			: [],
		loadFeeds(range),
	]);
	const sources = [...icloud, ...feeds];
	if (icloudError && !feeds.length) throw Object.assign(new Error(icloudError), {explained: true});

	// The same event can come back once per instance and per calendar copy.
	const seen = new Set();
	const events = sources
		.flatMap((c) => c.events)
		.filter((e) => (seen.has(e.id) ? false : seen.add(e.id)))
		.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

	return {
		configured: true,
		online: true,
		calendars: sources.filter((c) => !c.skipped && !c.error).map((c) => c.name),
		sources: sources.map((c) => ({name: c.name, source: c.source, count: c.events.length, skipped: c.skipped, error: c.error})),
		from: range.start.toISOString(),
		to: range.end.toISOString(),
		events,
		error: icloudError ? `iCloud: ${icloudError}` : null,
	};
}

function explain(err) {
	if (err.explained) return err.message;
	const status = err.response?.status || (/\b401\b/.test(err.message) ? 401 : null);
	if (status === 401 || /unauthori[sz]ed|invalid credentials/i.test(err.message)) {
		return 'Apple ID or app-specific password was rejected';
	}
	if (/ENOTFOUND|EAI_AGAIN/.test(err.code || err.message)) return 'can\'t reach iCloud (no internet?)';
	return err.message;
}

router.get('/', async (_req, res) => {
	if (!ICLOUD && !FEEDS.length) {
		return res.json({configured: false, online: false, events: [], calendars: [], sources: [], error: null});
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
		res.json(cache ? {...cache, stale: true} : {configured: true, online: false, events: [], calendars: [], sources: [], error: message});
	}
});

router._test = {eventsFrom};

module.exports = router;
