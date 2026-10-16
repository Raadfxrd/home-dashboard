/**
 * A small in-memory log of what went wrong, for the dashboard's bottom bar.
 *
 * Every console.warn / console.error in the backend lands here (the routes
 * already log their failures that way), tagged with the service it came from
 * and folded together when the same problem repeats, so a service that is
 * down for an hour shows as one line with a count rather than 360 lines.
 * Kept in memory only: a restart starts a clean log.
 */

const MAX_ENTRIES = 100;
const entries = [];
let nextId = 1;
let clearedAt = 0;

const SOURCES = [
	['jellyfin', /jellyfin/i],
	['weather', /weather|buienradar|openweather|rain/i],
	['nas', /\[NAS\]|snmp|nas metrics|history\./i],
	['prowlarr', /prowlarr|indexer/i],
	['qbittorrent', /qbittorrent/i],
	['nzbget', /nzbget/i],
	['sonarr', /sonarr/i],
	['radarr', /radarr/i],
	['docker', /docker|container/i],
];

function sourceOf(text) {
	for (const [name, pattern] of SOURCES) {
		if (pattern.test(text)) return name;
	}
	return 'server';
}

function stringify(part) {
	if (part instanceof Error) return part.message;
	if (typeof part === 'string') return part;
	// Our error details objects: {message, status, code} read better as text.
	if (part && typeof part === 'object' && typeof part.message === 'string') {
		const extra = [part.status && `HTTP ${part.status}`, part.code].filter(Boolean).join(', ');
		return extra ? `${part.message} (${extra})` : part.message;
	}
	try {
		return JSON.stringify(part);
	} catch {
		return String(part);
	}
}

/* Numbers that change on every repeat (ports, durations, counters) would
   stop identical problems folding together, so they are ignored for that. */
function fingerprint(level, source, message) {
	return `${level}|${source}|${message.replace(/\d+/g, '#')}`;
}

function record(level, args) {
	const message = args.map(stringify).join(' ').replace(/\s+/g, ' ').trim().slice(0, 500);
	if (!message) return;
	const source = sourceOf(message);
	const key = fingerprint(level, source, message);
	const now = Date.now();

	const existing = entries.find((e) => e.key === key);
	if (existing) {
		existing.count += 1;
		existing.lastAt = now;
		existing.message = message;
		entries.splice(entries.indexOf(existing), 1);
		entries.unshift(existing);
		return;
	}

	entries.unshift({id: nextId++, key, level, source, message, count: 1, firstAt: now, lastAt: now});
	if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
}

function install() {
	const originalWarn = console.warn.bind(console);
	const originalError = console.error.bind(console);
	console.warn = (...args) => {
		record('warning', args);
		originalWarn(...args);
	};
	console.error = (...args) => {
		record('error', args);
		originalError(...args);
	};
}

function list() {
	return entries.map(({key: _key, ...rest}) => rest);
}

function clear() {
	entries.length = 0;
	clearedAt = Date.now();
}

module.exports = {install, record, list, clear, clearedAt: () => clearedAt};
