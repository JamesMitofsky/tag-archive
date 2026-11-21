/**
 * The motion of the Archive Stream field: the water a visitor's finger moves.
 *
 * The projector never moves the field straight to where the finger says.
 * Touches arrive over a phone hotspot in bunches, so each drag moves a *target*
 * and the shown field follows it on a critically damped spring. That spring is
 * what turns network jitter into something that feels like viscosity. Once the
 * finger lifts, the field glides on with friction. As it slows, a magnet draws
 * the nearest item into the lens, so a released swipe always lands on
 * something. Left alone long enough, a slow current carries the field along
 * and the lens rests, so the screen returns to a wash of the archive drifting
 * by. The field starts that way too, since nobody has steered it yet.
 *
 * Two fingers pinch the field closer or farther. The zoom works like the
 * camera: each pinch moves a target scale and the shown scale follows it on a
 * spring, in log space, so zooming in by half and out by half feel the same.
 * It always zooms about the screen's center, where the lens sits, because the
 * iPad shows nothing of the field and a point between its fingers would mean
 * nothing on the projector.
 *
 * Pure and free of the DOM, so the feel can be tested and tuned in isolation.
 * Positions are world pixels. `cam` is the world point at the center of the
 * screen, and a world pixel is drawn `scale` screen pixels across. Speeds and
 * the finger's travel are screen pixels, so a swipe feels the same at any zoom.
 */

export type Vec = { x: number; y: number };

export const TUNING = {
	/** Projector px the field moves per iPad px of finger travel. */
	gain: 2.5,
	/** How tightly the shown field follows the finger's target (1/s). */
	followOmega: 18,
	/** Time for a released glide to lose half its speed (s). */
	glideHalfLife: 0.6,
	/** The fastest the field may travel (projector px/s). */
	maxSpeed: 4200,
	/** Below this speed, with no finger down, the magnet takes over (px/s). */
	magnetSpeed: 150,
	/** The magnet's spring (1/s): settles in about 1.2 s, without overshoot. */
	magnetOmega: 3.6,
	/** Seconds without a touch before the current starts and the lens rests. */
	idleAfter: 60,
	/** The current's speed (px/s) and how gently it gathers (half-life, s). */
	currentSpeed: 26,
	currentHalfLife: 2.5,
	/** The current's heading: down and to the right, like a slow stream. */
	currentHeading: { x: 0.92, y: 0.38 },
	/** How quickly the lens wakes at a touch, and rests once the current takes over (half-lives, s). */
	lensWakeHalfLife: 0.2,
	lensRestHalfLife: 1.2,
	/** Slower than this (px/s), a glide with nothing to catch simply stops. */
	restSpeed: 2,
	/**
	 * How strongly the iPad's pinch zooms: the field's scale changes by the
	 * fingers' spread to this power, so a comfortable pinch spans most of the range.
	 */
	zoomGain: 1.4,
	/** How tightly the shown scale follows the pinch's target (1/s). */
	zoomOmega: 14,
	/** The farthest out and in the field may be zoomed (screen px per world px). */
	minZoom: 0.16,
	maxZoom: 2.4,
	/** The longest frame stepped at once (s): a hitch must not fling the field. */
	maxStep: 1 / 20
} as const;

export type Tuning = { [K in keyof typeof TUNING]: (typeof TUNING)[K] extends Vec ? Vec : number };

/** The factor a quantity keeps over `dt` when it halves every `halfLife`. */
export function decay(halfLife: number, dt: number): number {
	return Math.pow(0.5, dt / halfLife);
}

/**
 * One step of a critically damped spring pulling `pos` toward `target`, in
 * closed form, so it is exact for any `dt` and never overshoots from rest.
 */
export function springStep(
	pos: number,
	vel: number,
	target: number,
	omega: number,
	dt: number
): [pos: number, vel: number] {
	const c1 = pos - target;
	const c2 = vel + omega * c1;
	const e = Math.exp(-omega * dt);
	return [target + (c1 + c2 * dt) * e, (c2 - omega * (c1 + c2 * dt)) * e];
}

export function length(v: Vec): number {
	return Math.hypot(v.x, v.y);
}

/** `v`, shortened to at most `max` long. */
export function clampLength(v: Vec, max: number): Vec {
	const len = length(v);
	return len > max ? { x: (v.x / len) * max, y: (v.y / len) * max } : v;
}

/** A pointer position at a moment, in ms (as `PointerEvent.timeStamp`). */
export type Sample = { t: number; x: number; y: number };

/**
 * The finger's velocity as it lifts (px/s), from the samples of its last
 * `windowMs`: the least-squares slope, which no single jittery sample can
 * swing. A finger that stopped before lifting has no velocity, however fast
 * it moved before that, so a deliberate stop-and-lift stays put.
 */
export function releaseVelocity(
	samples: readonly Sample[],
	releaseAt: number,
	windowMs = 80,
	stillAfterMs = 60
): Vec {
	const last = samples[samples.length - 1];
	if (!last || releaseAt - last.t > stillAfterMs) return { x: 0, y: 0 };
	const recent = samples.filter((s) => last.t - s.t <= windowMs);
	if (recent.length < 2) return { x: 0, y: 0 };

	const n = recent.length;
	const meanT = recent.reduce((sum, s) => sum + s.t, 0) / n;
	const meanX = recent.reduce((sum, s) => sum + s.x, 0) / n;
	const meanY = recent.reduce((sum, s) => sum + s.y, 0) / n;
	let tt = 0;
	let tx = 0;
	let ty = 0;
	for (const s of recent) {
		const dt = s.t - meanT;
		tt += dt * dt;
		tx += dt * (s.x - meanX);
		ty += dt * (s.y - meanY);
	}
	if (tt === 0) return { x: 0, y: 0 };
	// Slopes are px per ms.
	return { x: (tx / tt) * 1000, y: (ty / tt) * 1000 };
}

export type Mode = 'touch' | 'glide' | 'magnet' | 'current';

/**
 * Where the magnet should pull: the world position of the item nearest
 * `point`, or null when there is nothing near enough to be worth catching.
 */
export type FindAnchor = (point: Vec) => Vec | null;

export type Sim = {
	/** The world point at the center of the screen, as shown. */
	readonly cam: Vec;
	/** How fast the shown field is moving across the screen (px/s). */
	readonly speed: number;
	readonly mode: Mode;
	/**
	 * How much the lens is at work, 0..1: 1 while someone is steering or the
	 * field settles from their last swipe, easing to 0 once the current takes
	 * over, so nothing drifting by is drawn into focus.
	 */
	readonly lens: number;
	/** The shown zoom: screen px per world px. */
	readonly scale: number;
	/** Whether the shown zoom is still on its way to the pinch's target. */
	readonly zooming: boolean;
	/** A finger touched down. `now` is in seconds. */
	down(now: number): void;
	/** The finger moved by (dx, dy) of its own px; `gain` scales it to the projector. */
	drag(dx: number, dy: number, now: number, gain?: number): void;
	/** The finger lifted, moving at (vx, vy) of its own px/s. */
	up(vx: number, vy: number, now: number, gain?: number): void;
	/** Two fingers' spread changed by `factor`; `gain` is the power it is raised to. */
	pinch(factor: number, now: number, gain?: number): void;
	/** The zoom range, which the page narrows so one screen never sees past the world. */
	setZoomRange(min: number, max: number): void;
	step(dt: number, now: number, findAnchor: FindAnchor): void;
	/**
	 * Shift every position by a whole world size. The field wraps, so the view
	 * is unchanged; it keeps the numbers small over a long night.
	 */
	shift(dx: number, dy: number): void;
};

export function createSim(start: Vec, tuning: Tuning = TUNING): Sim {
	const cam = { ...start };
	const camVel = { x: 0, y: 0 };
	const target = { ...start };
	let vel: Vec = { x: 0, y: 0 };
	// Nobody has steered yet, so the field starts in the current, lens at rest.
	let mode: Mode = 'current';
	let anchor: Vec | null = null;
	let lastInput = -Infinity;
	let speed = 0;
	let lens = 0;
	// The zoom, in log space: shown, its velocity, and the pinch's target.
	let logMin = Math.log(tuning.minZoom);
	let logMax = Math.log(tuning.maxZoom);
	let logScale = 0;
	let logScaleVel = 0;
	let logTarget = 0;
	let scale = 1;
	const clampLog = (v: number) => Math.min(logMax, Math.max(logMin, v));

	return {
		get cam() {
			return cam;
		},
		get speed() {
			return speed;
		},
		get mode() {
			return mode;
		},
		get lens() {
			return lens;
		},
		get scale() {
			return scale;
		},
		get zooming() {
			return Math.abs(logScaleVel) > 0.01 || Math.abs(logScale - logTarget) > 0.002;
		},
		down(t) {
			mode = 'touch';
			anchor = null;
			vel = { x: 0, y: 0 };
			lastInput = t;
		},
		drag(dx, dy, t, gain = tuning.gain) {
			// A drag without a down (one lost on the network) still counts as a touch.
			if (mode !== 'touch') this.down(t);
			// The field moves with the finger, so the camera moves against it,
			// by the finger's travel in world px at the shown zoom.
			target.x -= (dx * gain) / scale;
			target.y -= (dy * gain) / scale;
			lastInput = t;
		},
		up(vx, vy, t, gain = tuning.gain) {
			mode = 'glide';
			anchor = null;
			const v = clampLength({ x: -vx * gain, y: -vy * gain }, tuning.maxSpeed);
			vel = { x: v.x / scale, y: v.y / scale };
			lastInput = t;
		},
		pinch(factor, t, gain = tuning.zoomGain) {
			if (!(factor > 0) || !Number.isFinite(factor)) return;
			logTarget = clampLog(logTarget + gain * Math.log(factor));
			lastInput = t;
			// A pinch (or a trackpad's, which has no down or up) wakes a resting
			// field without holding it as a touch: it settles as after a swipe.
			if (mode === 'current') {
				mode = 'glide';
				anchor = null;
			}
		},
		setZoomRange(min, max) {
			logMax = Math.log(Math.max(min, max));
			logMin = Math.min(Math.log(min), logMax);
			logTarget = clampLog(logTarget);
		},
		step(rawDt, t, findAnchor) {
			const dt = Math.min(Math.max(rawDt, 0), tuning.maxStep);
			if (dt === 0) return;

			[logScale, logScaleVel] = springStep(logScale, logScaleVel, logTarget, tuning.zoomOmega, dt);
			scale = Math.exp(logScale);

			if (mode !== 'touch') {
				if (t - lastInput > tuning.idleAfter) {
					mode = 'current';
					anchor = null;
					const h = tuning.currentHeading;
					const len = Math.hypot(h.x, h.y) || 1;
					// The current's speed is on screen, whatever the zoom.
					const want = {
						x: (h.x / len) * (tuning.currentSpeed / scale),
						y: (h.y / len) * (tuning.currentSpeed / scale)
					};
					const keep = decay(tuning.currentHalfLife, dt);
					vel = { x: want.x + (vel.x - want.x) * keep, y: want.y + (vel.y - want.y) * keep };
				} else if (mode === 'glide' && length(vel) * scale < tuning.magnetSpeed) {
					// Caught once, then held: the anchor is never swapped mid-settle,
					// or the field could hop between two items equally near.
					anchor = findAnchor(target);
					mode = 'magnet';
				}

				if (mode === 'magnet') {
					if (anchor) {
						const w = tuning.magnetOmega;
						vel = {
							x: vel.x + (w * w * (anchor.x - target.x) - 2 * w * vel.x) * dt,
							y: vel.y + (w * w * (anchor.y - target.y) - 2 * w * vel.y) * dt
						};
					} else {
						// Nothing to catch: just let it come to rest, and then stop, rather
						// than crawl on by fractions of a pixel for seconds.
						const keep = decay(tuning.glideHalfLife, dt);
						vel = { x: vel.x * keep, y: vel.y * keep };
						if (length(vel) * scale < tuning.restSpeed) vel = { x: 0, y: 0 };
					}
				} else if (mode === 'glide') {
					const keep = decay(tuning.glideHalfLife, dt);
					vel = { x: vel.x * keep, y: vel.y * keep };
				}
				target.x += vel.x * dt;
				target.y += vel.y * dt;
			}

			[cam.x, camVel.x] = springStep(cam.x, camVel.x, target.x, tuning.followOmega, dt);
			[cam.y, camVel.y] = springStep(cam.y, camVel.y, target.y, tuning.followOmega, dt);
			speed = length(camVel) * scale;

			const goal = mode === 'current' ? 0 : 1;
			const keep = decay(goal ? tuning.lensWakeHalfLife : tuning.lensRestHalfLife, dt);
			lens = goal + (lens - goal) * keep;
			// Land exactly, so a resting lens draws nothing at all into focus.
			if (Math.abs(lens - goal) < 0.001) lens = goal;
		},
		shift(dx, dy) {
			cam.x += dx;
			cam.y += dy;
			target.x += dx;
			target.y += dy;
			if (anchor) anchor = { x: anchor.x + dx, y: anchor.y + dy };
		}
	};
}
