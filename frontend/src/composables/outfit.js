/**
 * What to wear for a stretch of time, from the weather samples that cover
 * it (forecast blocks, the current reading, the radar). Plain rules, tuned
 * for a Dutch climate: dress for the coldest feels-like moment, carry rain
 * gear when rain is likely, and skip the umbrella when it's too windy to
 * hold one.
 *
 * sample: {feelsLike, temperature, mm, rainChance, windSpeed, windGust,
 *          snow, clouds, daylight, conditionId}
 */

const LAYERS = [
	{min: 24, key: 'tshirt', icon: 'tshirt', label: 'T-shirt'},
	{min: 18, key: 'tshirt-layer', icon: 'tshirt', label: 'T-shirt with a light layer'},
	{min: 13, key: 'sweater', icon: 'sweater', label: 'Sweater or light jacket'},
	{min: 7, key: 'jacket', icon: 'jacket', label: 'Jacket'},
	{min: 1, key: 'coat', icon: 'coat', label: 'Warm coat'},
	{min: -Infinity, key: 'winter', icon: 'coat', label: 'Winter coat'},
];

const finite = (v) => Number.isFinite(v);

export function summarize(samples) {
	const list = samples.filter(Boolean);
	const pick = (f) => list.map(f).filter(finite);
	const feels = pick((s) => s.feelsLike ?? s.temperature);
	const winds = pick((s) => Math.max(s.windGust || 0, s.windSpeed || 0));
	return {
		feelsMin: feels.length ? Math.min(...feels) : null,
		feelsMax: feels.length ? Math.max(...feels) : null,
		mmMax: Math.max(0, ...pick((s) => s.mm)),
		chanceMax: Math.max(0, ...pick((s) => s.rainChance)),
		windMax: winds.length ? Math.max(...winds) : null,
		snow: list.some((s) => s.snow || (s.conditionId >= 600 && s.conditionId < 700)),
		sunny: list.length > 0 && list.every((s) => s.daylight !== false && (s.clouds ?? 100) <= 30) && list.some((s) => s.daylight),
	};
}

export function outfitFor(samples) {
	const w = summarize(samples);
	if (w.feelsMin == null) return null;

	const items = [];
	const layer = LAYERS.find((l) => w.feelsMin >= l.min);
	items.push({key: layer.key, icon: layer.icon, label: layer.label});

	// Snow calls for shoes and a hood, not an umbrella.
	const wet = !w.snow && (w.mmMax >= 0.3 || w.chanceMax >= 60);
	const maybeWet = !w.snow && !wet && (w.mmMax >= 0.1 || w.chanceMax >= 30);
	const windy = (w.windMax ?? 0) >= 40;

	if (wet && windy) items.push({key: 'raincoat', icon: 'raincoat', label: 'Rain jacket (too windy for an umbrella)'});
	else if (wet) items.push({key: 'umbrella', icon: 'umbrella', label: 'Umbrella or rain jacket'});
	else if (maybeWet) items.push({key: 'umbrella-maybe', icon: 'umbrella', label: 'Small umbrella, just in case'});

	if (w.feelsMin <= 3) items.push({key: 'gloves', icon: 'gloves', label: 'Hat and gloves'});
	else if (w.feelsMin <= 8 && windy) items.push({key: 'scarf', icon: 'scarf', label: 'Scarf against the wind'});
	if (w.snow) items.push({key: 'boots', icon: 'boots', label: 'Waterproof shoes'});
	if (w.sunny && !wet) items.push({key: 'sunglasses', icon: 'sunglasses', label: w.feelsMax >= 22 ? 'Sunglasses and sunscreen' : 'Sunglasses'});

	return {items, headline: headline(items), weather: w};
}

/* "Jacket and an umbrella", "T-shirt weather", … */
function headline(items) {
	const [layer, ...extras] = items;
	const main = layer.key === 'tshirt' ? 'T-shirt weather' : layer.label;
	const extra = extras[0];
	if (!extra) return main;
	const short = {
		raincoat: 'a rain jacket',
		umbrella: 'an umbrella',
		'umbrella-maybe': 'maybe an umbrella',
		gloves: 'a hat and gloves',
		scarf: 'a scarf',
		boots: 'waterproof shoes',
		sunglasses: 'sunglasses',
	}[extra.key];
	if (extra.key === 'gloves') return `${main}, hat and gloves`;
	return layer.key === 'tshirt' ? `${main}, bring ${short}` : `${main} and ${short}`;
}
