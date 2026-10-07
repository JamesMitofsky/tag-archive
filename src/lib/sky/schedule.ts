import { frameDistance, type SkyFrame } from './engine';

/**
 * When to repaint the sky next — decided by how fast the colour is actually
 * changing, not by a fixed interval or a hand-written table of "dusk" hours.
 *
 * After each paint, look ahead at growing steps and sleep for the longest one
 * whose change stays under MAX_STEP_DE. Through deep day and night the colour
 * barely moves, so that is the 15-minute cap; through golden hour and twilight
 * it is every 30–60 s. Because the cadence is derived from the palette itself,
 * retuning the palette retunes the cadence too.
 *
 * MAX_STEP_DE is about a third of a just-noticeable OKLab difference (~0.02),
 * so each step is invisible on its own and needs no CSS transition — a
 * transition would repaint the full-screen sky every frame, which is the real
 * cost being avoided. "The colour" is the whole screen's (`frameDistance`):
 * the glow following the sun counts as much as its colours, and the stars
 * coming out are weighed in too. Measured on the generated palette: 440–490
 * repaints a day, and the colour never moves faster than ΔE 0.0024 per 15 s,
 * so even the shortest step stays under the threshold.
 */
export const MAX_STEP_DE = 0.006;

/** Look-ahead steps, shortest first; the last is the longest sleep. */
export const STEPS_MS = [15, 30, 60, 120, 240, 480, 900].map((s) => s * 1000);

/** Milliseconds (sky time) until the sky should next be repainted. */
export function nextRepaintDelay(now: number, frameAt: (ms: number) => SkyFrame): number {
	const here = frameAt(now);
	let delay = STEPS_MS[0];
	for (const step of STEPS_MS) {
		if (frameDistance(here, frameAt(now + step)) > MAX_STEP_DE) break;
		delay = step;
	}
	return delay;
}

/**
 * The sky's clock. Real time, unless the URL asks otherwise for previewing:
 * `?sky-at=<ISO date-time>` starts the sky at that moment, and
 * `?sky-speed=<n>` runs it n× faster (e.g. 600 → a day in 2.4 minutes).
 */
export function skyClock(search: string, realNow: () => number = Date.now) {
	const params = new URLSearchParams(search);
	const startReal = realNow();
	const at = Date.parse(params.get('sky-at') ?? '');
	const startSky = Number.isNaN(at) ? startReal : at;
	const requested = Number(params.get('sky-speed'));
	const speed = Number.isFinite(requested) && requested > 0 ? requested : 1;
	return {
		speed,
		now: () => startSky + (realNow() - startReal) * speed
	};
}
