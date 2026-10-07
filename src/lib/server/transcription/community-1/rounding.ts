/** Rounds halves to the nearest even integer, matching `np.rint` and Python's `round`. */
export function roundHalfEven(value: number): number {
	const floor = Math.floor(value);
	const fraction = value - floor;

	if (fraction < 0.5) return floor;
	if (fraction > 0.5) return floor + 1;
	return floor % 2 === 0 ? floor : floor + 1;
}

export interface SlidingWindow {
	start: number;
	duration: number;
	step: number;
}

export function closestFrame(time: number, window: SlidingWindow): number {
	return roundHalfEven((time - window.start - 0.5 * window.duration) / window.step);
}
