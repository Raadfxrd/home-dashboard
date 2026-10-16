/* One sentence for a run of 5-minute rain slots ({time, mm} with mm in mm/h),
   e.g. "Light rain from about 02:00, dry again by 03:05". Mirrors the
   backend's wording so the sentence matches whichever window is shown. */

const WET = 0.1; // mm/h below this reads as dry

export function describeRain(slots, windowLabel, {minDry = 2} = {}) {
	if (!slots?.length) return null;
	const wet = slots.map((s) => s.mm >= WET);
	const peak = Math.max(...slots.map((s) => s.mm));
	const strength = peak < 1 ? 'Light rain' : peak < 4 ? 'Rain' : 'Heavy rain';

	if (!wet.some(Boolean)) return `Dry for the ${windowLabel}`;

	// The first moment it stays dry for at least `minDry` slots in a row.
	const dryAgainFrom = (start) => {
		for (let i = start; i <= slots.length - minDry; i += 1) {
			if (wet.slice(i, i + minDry).every((w) => !w)) return i;
		}
		return wet[slots.length - 1] ? -1 : slots.length - 1;
	};

	// A second shower later in the window gets a short mention.
	const later = (end) => {
		if (end < 0) return '';
		const next = wet.indexOf(true, end + 1);
		return next === -1 ? '' : `, more around ${slots[next].time}`;
	};

	if (wet[0]) {
		const end = dryAgainFrom(1);
		return end === -1 ? `${strength} for the ${windowLabel}` : `${strength} until about ${slots[end].time}${later(end)}`;
	}

	const start = wet.indexOf(true);
	const end = dryAgainFrom(start + 1);
	return end === -1
		? `${strength} from about ${slots[start].time}`
		: `${strength} from about ${slots[start].time}, dry again by ${slots[end].time}${later(end)}`;
}
