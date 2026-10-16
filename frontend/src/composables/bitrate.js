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
	if (mbit >= 1) return `${mbit.toFixed(1)} Mbit/s`;
	const kbit = (value * 8) / 1e3;
	return `${kbit >= 10 ? Math.round(kbit) : kbit.toFixed(1)} kbit/s`;
}

/* A round ceiling in Mbit/s just above the given peak (bytes per second),
   returned in bytes per second for the chart scale. */
export function niceBitrateCeiling(bytesPerSecond, minMbit = 10) {
	const mbit = Math.max(minMbit, ((Number(bytesPerSecond) || 0) * 8) / 1e6);
	const magnitude = 10 ** Math.floor(Math.log10(mbit));
	const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * magnitude >= mbit);
	return (step * magnitude * 1e6) / 8;
}
