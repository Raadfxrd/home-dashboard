/* Network speeds in megabits per second, the unit internet plans are sold
   in (decimal: 1 Mbit = 1,000,000 bits), so "940 Mbit/s" lines up with a
   1 Gbit plan. Input is bytes per second. */
export function formatBitrate(bytesPerSecond) {
	const value = Number(bytesPerSecond);
	if (!Number.isFinite(value)) return '–';
	if (value <= 0) return '0 Mbit/s';
	const mbit = (value * 8) / 1e6;
	if (mbit >= 1000) return `${Number((mbit / 1000).toFixed(2))} Gbit/s`;
	if (mbit >= 100) return `${Math.round(mbit)} Mbit/s`;
	if (mbit >= 10) return `${mbit.toFixed(0)} Mbit/s`;
	if (mbit >= 1) return `${Number(mbit.toFixed(1))} Mbit/s`;
	const kbit = (value * 8) / 1e3;
	return `${kbit >= 10 ? Math.round(kbit) : kbit.toFixed(1)} kbit/s`;
}

/* A round ceiling in Mbit/s just above the given peak (bytes per second),
   returned in bytes per second for the chart scale. The scale follows the
   traffic down: a quiet hour gets a 1 Mbit/s step below 10, a 5 Mbit/s
   step up to 50, then 1-1.5-2-2.5-3-4-5-6-8 steps, so the line always uses
   the height of the chart. */
export function niceBitrateCeiling(bytesPerSecond, minMbit = 1) {
	const mbit = Math.max(minMbit, ((Number(bytesPerSecond) || 0) * 8) / 1e6);
	let ceiling;
	if (mbit <= 10) ceiling = Math.ceil(mbit);
	else if (mbit <= 50) ceiling = Math.ceil(mbit / 5) * 5;
	else {
		const magnitude = 10 ** Math.floor(Math.log10(mbit));
		ceiling = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * magnitude >= mbit) * magnitude;
	}
	return (ceiling * 1e6) / 8;
}
