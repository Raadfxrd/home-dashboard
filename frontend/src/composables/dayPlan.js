import {outfitFor} from './outfit.js';

/**
 * Turns the calendar and the weather into a plan: when you'll be out, and
 * what the weather does in that stretch.
 *
 * - The next timed event at a real place within the coming 20 hours sets
 *   the window (from half an hour before it until it ends).
 * - With nothing planned: the next few hours, or tomorrow's daytime if
 *   it's already late in the evening.
 */

const HOUR = 3600000;
const timeFmt = new Intl.DateTimeFormat('nl-NL', {hour: '2-digit', minute: '2-digit'});
export const clock = (t) => timeFmt.format(new Date(t));

/* OpenWeather's icon code says enough about cloud and daylight for "sunny". */
function fromCurrent(here) {
	if (!here) return null;
	const code = String(here.icon || '');
	const clouds = {'01': 0, '02': 20, '03': 50, '04': 90}[code.slice(0, 2)] ?? 80;
	return {
		feelsLike: here.feelsLike ?? here.temperature,
		temperature: here.temperature,
		windSpeed: here.windSpeed,
		conditionId: here.conditionId,
		clouds,
		daylight: code.endsWith('d'),
		source: 'now',
	};
}

/* Every weather sample that says something about [start, end]. */
export function samplesFor(start, end, {here, outlook}, now = Date.now()) {
	const samples = [];
	// Forecast blocks are 3 hours wide, centred on their time.
	for (const b of outlook?.week || outlook?.blocks || []) {
		if (b.at + 1.5 * HOUR >= start && b.at - 1.5 * HOUR <= end) samples.push({...b, source: 'forecast'});
	}
	if (start <= now + 1.5 * HOUR) {
		const current = fromCurrent(here);
		if (current) samples.push(current);
	}
	// Radar slots: 5 minutes each, starting now.
	(outlook?.rain?.slots || []).forEach((slot, i) => {
		const t = now + i * 5 * 60000;
		if (t >= start - 5 * 60000 && t <= end) samples.push({mm: slot.mm, source: 'radar'});
	});
	return samples;
}

export function outingWindow(events = [], now = Date.now()) {
	const next = events
		.filter((e) => e.out && !e.allDay && Date.parse(e.end) > now && Date.parse(e.start) < now + 20 * HOUR)
		.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
	if (next) {
		const start = Math.max(now, Date.parse(next.start) - 0.5 * HOUR);
		const ongoing = Date.parse(next.start) <= now;
		return {
			start,
			end: Date.parse(next.end),
			event: next,
			label: ongoing ? `For ${next.title}, now` : `For ${next.title} at ${clock(next.start)}`,
		};
	}
	const d = new Date(now);
	if (d.getHours() >= 21 || d.getHours() < 5) {
		const morning = new Date(now);
		if (d.getHours() >= 21) morning.setDate(morning.getDate() + 1);
		morning.setHours(8, 0, 0, 0);
		return {start: morning.getTime(), end: morning.getTime() + 10 * HOUR, event: null, label: 'For tomorrow'};
	}
	const end = Math.min(now + 4 * HOUR, new Date(now).setHours(23, 0, 0, 0));
	return {start: now, end, event: null, label: 'For the next few hours'};
}

export function planFor(window, weather) {
	if (!window) return null;
	const samples = samplesFor(window.start, window.end, weather);
	const outfit = outfitFor(samples);
	return outfit ? {...window, samples, outfit} : null;
}

/* Today's and tomorrow's agenda, finished events left out. */
const weekdayFmt = new Intl.DateTimeFormat('en-GB', {weekday: 'long', day: 'numeric', month: 'short'});

/* Upcoming events grouped per day, today first: [{key, label, items}].
   Days without anything on them are left out. */
export function agenda(events = [], now = Date.now(), days = 7) {
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	const upcoming = events.filter((e) => Date.parse(e.end) > now);
	const order = (a, b) => (b.allDay - a.allDay) || Date.parse(a.start) - Date.parse(b.start);
	const list = [];
	for (let i = 0; i < days; i++) {
		const from = new Date(start);
		from.setDate(start.getDate() + i);
		const to = new Date(from);
		to.setDate(from.getDate() + 1);
		// Multi-day events show on the day they're running, today included.
		const items = upcoming
			.filter((e) => (i === 0 ? Date.parse(e.start) < to.getTime() : Date.parse(e.start) >= from.getTime() && Date.parse(e.start) < to.getTime()))
			.sort(order);
		if (!items.length) continue;
		list.push({key: from.toDateString(), label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekdayFmt.format(from), items});
	}
	return list;
}
