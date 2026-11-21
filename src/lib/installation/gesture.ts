/**
 * One or two fingers on a surface, read as the water's gesture: one finger
 * drags it, and two fingers drag it by their midpoint and pinch it by their
 * spread. A third finger, or a resting palm, is ignored, so it can't make the
 * field jitter.
 *
 * The gesture's point is the one finger, or the midpoint of two. Whenever a
 * finger lands or lifts, that point jumps, so the gesture takes the new point
 * as its baseline instead of reading the jump as travel. For the same reason
 * the samples behind the release velocity start again, so lifting one finger
 * of a pinch and then the other doesn't fling the field.
 *
 * Pure and free of the DOM: the pages feed it pointer positions.
 */

import { releaseVelocity, type Sample, type Vec } from './physics.ts';

/** The most fingers that steer at once. */
export const MAX_FINGERS = 2;
/**
 * Two fingers closer than this (px) are taken as this far apart, so fingers
 * that nearly touch can't make a tiny spread read as a huge zoom.
 */
export const MIN_SPREAD = 24;
/** How much finger history is kept for the release velocity (ms). */
const HISTORY_MS = 200;

export type GestureSink = {
	/** The first finger touched down. */
	down(): void;
	/** The gesture's point moved by (dx, dy) px. */
	drag(dx: number, dy: number): void;
	/** Two fingers' spread changed by `factor`: above 1 as they part. */
	pinch(factor: number): void;
	/** The last finger lifted, the gesture's point moving at (vx, vy) px/s. */
	up(vx: number, vy: number): void;
};

export type Gesture = {
	/** How many fingers are steering. */
	readonly count: number;
	/** A finger touched down. False when it is ignored (a third finger). */
	pointerDown(id: number, x: number, y: number, t: number): boolean;
	/**
	 * A finger moved, through `points` in order (a pointer's coalesced events,
	 * or just the one). False when it is a finger that is ignored.
	 */
	pointerMove(id: number, points: readonly Sample[]): boolean;
	/** A finger lifted; `cancelled` when the system took the touch away. */
	pointerUp(id: number, t: number, cancelled?: boolean): boolean;
};

export function createGesture(sink: GestureSink): Gesture {
	const fingers = new Map<number, Vec>();
	let point: Vec = { x: 0, y: 0 };
	let spread = 0;
	let samples: Sample[] = [];

	const measure = (): { point: Vec; spread: number } => {
		const list = [...fingers.values()];
		const x = list.reduce((sum, f) => sum + f.x, 0) / list.length;
		const y = list.reduce((sum, f) => sum + f.y, 0) / list.length;
		const apart =
			list.length === 2
				? Math.max(MIN_SPREAD, Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y))
				: 0;
		return { point: { x, y }, spread: apart };
	};

	const rebase = (t: number) => {
		({ point, spread } = measure());
		samples = [{ t, ...point }];
	};

	return {
		get count() {
			return fingers.size;
		},
		pointerDown(id, x, y, t) {
			if (fingers.has(id) || fingers.size >= MAX_FINGERS) return false;
			fingers.set(id, { x, y });
			if (fingers.size === 1) sink.down();
			rebase(t);
			return true;
		},
		pointerMove(id, points) {
			const finger = fingers.get(id);
			if (!finger) return false;
			for (const p of points) {
				finger.x = p.x;
				finger.y = p.y;
				const next = measure();
				const dx = next.point.x - point.x;
				const dy = next.point.y - point.y;
				if (dx !== 0 || dy !== 0) sink.drag(dx, dy);
				if (spread > 0 && next.spread > 0 && next.spread !== spread) {
					sink.pinch(next.spread / spread);
				}
				point = next.point;
				spread = next.spread;
				samples.push({ t: p.t, ...point });
			}
			const last = samples[samples.length - 1];
			while (samples.length > 2 && last.t - samples[0].t > HISTORY_MS) samples.shift();
			return true;
		},
		pointerUp(id, t, cancelled = false) {
			if (!fingers.delete(id)) return false;
			if (fingers.size > 0) {
				rebase(t);
				return true;
			}
			const v = cancelled ? { x: 0, y: 0 } : releaseVelocity(samples, t);
			samples = [];
			sink.up(v.x, v.y);
			return true;
		}
	};
}
