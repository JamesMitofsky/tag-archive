/**
 * Two fingers on a Mac's trackpad, read as one finger on the iPad's water.
 *
 * The browser reports a two-finger swipe only as a stream of wheel events,
 * with no word of when the fingers touch or lift. Worse, once they lift,
 * macOS keeps the stream going with momentum events of its own, decaying
 * deltas that look just like a swipe. If those moved the field, the trackpad
 * would throw it with the OS's inertia instead of the projector's glide and
 * magnet. So this reads the stream as the iPad's gesture: the first event is
 * the touch, the deltas are the drag, and the moment the deltas start to decay
 * as momentum does (or the browser says so outright) is the lift, carried on
 * at the speed the fingers had. What momentum follows is ignored, and the sim
 * glides on from there as it does after an iPad flick. A stream that simply
 * stops is fingers that came to rest before lifting, which lift with no speed.
 *
 * The momentum heuristic follows wheel-gestures (MIT, github.com/xiel/
 * wheel-gestures), which Embla Carousel relies on: velocity is taken over
 * pairs of events, and five readings in a row that slow the way macOS's
 * momentum decays mean the fingers are gone. A browser that sets
 * `WheelEvent.momentum` is believed instead.
 *
 * Pure and free of the DOM apart from reading a WheelEvent's fields, so the
 * gesture can be tested on recorded streams. Times are ms, as
 * `WheelEvent.timeStamp` and `performance.now()`.
 */

import { releaseVelocity, type Sample, type Vec } from './physics.ts';

/** One wheel event, in px of finger travel: positive x is the fingers moving right. */
export type WheelInput = {
	t: number;
	dx: number;
	dy: number;
	/** What the browser says of momentum, where it says anything. */
	momentum?: boolean;
};

export type TrackpadHandlers = {
	/** Fingers touched down. */
	down(): void;
	/** Fingers moved by (dx, dy) px. */
	drag(dx: number, dy: number): void;
	/** Fingers lifted, moving at (vx, vy) px/s. */
	up(vx: number, vy: number): void;
};

/**
 * - `idle`: nothing on the trackpad.
 * - `touch`: fingers moving; their deltas drag the field.
 * - `coast`: the fingers have lifted and the OS's momentum is still arriving,
 *   to be ignored until it stops or fingers come back.
 */
export type TrackpadPhase = 'idle' | 'touch' | 'coast';

/** Events merged into one velocity reading, to smooth out uneven delivery. */
const MERGE = 2;
/** Readings in a row that must all slow like momentum before the fingers count as lifted. */
const ANALYZE = 5;
/** The share of its speed momentum keeps from one reading to the next. */
const DECAY_MIN = 0.6;
const DECAY_MAX = 0.96;
/**
 * Momentum only ever slows. Over ANALYZE readings it loses far more than
 * this share of its speed, even in the whole-pixel deltas that make some
 * readings tie, so a coast that keeps more was fingers all along.
 */
const COAST_KEEPS_AT_MOST = 0.9;
/** Below this delta (px), whole-pixel rounding hides whether momentum still slows. */
const COAST_CHECK_FROM = 3;
/** Until the stream's rate is known, how long a silence ends the gesture (ms). */
const END_AFTER_DEFAULT = 400;
/** Once it is known, a silence of this many event intervals ends it, within bounds (ms). */
const END_AFTER_INTERVALS = 5;
const END_AFTER_MIN = 100;
const END_AFTER_MAX = 1000;
/**
 * Momentum is let go only after a longer silence, so a hitch in its delivery
 * is never taken for fingers touching down again (ms).
 */
const COAST_END_AFTER = 300;

/** px per unit of `WheelEvent.deltaMode`: pixels, lines, pages. */
function deltaUnit(mode: number, pageHeight: number): number {
	return mode === 1 ? 18 : mode === 2 ? pageHeight : 1;
}

/**
 * A wheel event as finger travel. The browser reports where the page would
 * scroll; under macOS's natural scrolling that is opposite to the fingers, so
 * the signs flip, and the field moves with the fingers as it does on the iPad.
 */
export function wheelInput(event: WheelEvent, pageHeight: number): WheelInput {
	const unit = deltaUnit(event.deltaMode, pageHeight);
	// Not yet in the DOM's types; Chromium sets it on platforms that report momentum.
	const momentum = (event as WheelEvent & { momentum?: unknown }).momentum;
	return {
		t: event.timeStamp,
		dx: -event.deltaX * unit,
		dy: -event.deltaY * unit,
		momentum: typeof momentum === 'boolean' ? momentum : undefined
	};
}

export type Trackpad = {
	readonly phase: TrackpadPhase;
	/** A wheel event arrived. */
	feed(input: WheelInput): void;
	/** Call every frame, so a stream that has gone quiet ends. `now` in ms. */
	tick(now: number): void;
};

export function createTrackpad(handlers: TrackpadHandlers): Trackpad {
	let phase: TrackpadPhase = 'idle';
	let lastT = -Infinity;
	let endAfter = END_AFTER_DEFAULT;
	/** Where the fingers have traveled, for the release velocity. */
	let pos: Vec = { x: 0, y: 0 };
	let samples: Sample[] = [];
	let merging: WheelInput[] = [];
	/** The last merged reading: when, and how fast (px/ms). */
	let reading: { t: number; v: Vec } | null = null;
	/** The latest readings' share of speed kept from the one before. */
	let slowdowns: number[] = [];
	/** While coasting: the momentum's heading, the smallest delta it has slowed to, and what it has moved. */
	let coastDir: Vec = { x: 0, y: 0 };
	let coastMin = Infinity;
	let held: Vec = { x: 0, y: 0 };

	/** How long a silence ends what is going on now. */
	const silence = () => (phase === 'coast' ? Math.max(endAfter, COAST_END_AFTER) : endAfter);

	const start = (t: number) => {
		phase = 'touch';
		pos = { x: 0, y: 0 };
		samples = [{ t, ...pos }];
		merging = [];
		reading = null;
		slowdowns = [];
		endAfter = END_AFTER_DEFAULT;
		handlers.down();
	};

	const coast = (input: WheelInput, abs: number) => {
		phase = 'coast';
		coastDir = { x: Math.sign(input.dx), y: Math.sign(input.dy) };
		coastMin = abs;
		held = { x: 0, y: 0 };
		slowdowns = [];
	};

	/** Folds one event into the readings, and keeps the latest ANALYZE slowdowns. */
	const read = (input: WheelInput) => {
		merging.push(input);
		if (merging.length < MERGE) return;
		const at = merging.reduce((sum, e) => sum + e.t, 0) / merging.length;
		const sum = merging.reduce((s, e) => ({ x: s.x + e.dx, y: s.y + e.dy }), { x: 0, y: 0 });
		merging = [];
		const prev = reading;
		const span = prev ? at - prev.t : 0;
		if (!prev || span <= 0) {
			reading = { t: at, v: { x: 0, y: 0 } };
			return;
		}
		const v = { x: sum.x / span, y: sum.y / span };
		reading = { t: at, v };
		endAfter = Math.min(
			END_AFTER_MAX,
			Math.max(END_AFTER_MIN, (span / MERGE) * END_AFTER_INTERVALS)
		);
		// How much of the last speed carries on along the same line. Momentum
		// keeps its heading and loses a steady share; a turn or a speed-up is
		// fingers.
		const prevSq = prev.v.x * prev.v.x + prev.v.y * prev.v.y;
		slowdowns.push(prevSq > 0 ? (v.x * prev.v.x + v.y * prev.v.y) / prevSq : Infinity);
		if (slowdowns.length > ANALYZE) slowdowns.shift();
	};

	/** The fingers are gone: the latest readings all slowed as momentum does. */
	const lifted = () =>
		slowdowns.length === ANALYZE && slowdowns.every((s) => s >= DECAY_MIN && s <= DECAY_MAX);

	/** What was taken for momentum has not slowed as momentum must. */
	const neverLifted = (abs: number) =>
		abs >= COAST_CHECK_FROM &&
		slowdowns.length === ANALYZE &&
		slowdowns.reduce((kept, s) => kept * Math.max(0, s), 1) > COAST_KEEPS_AT_MOST;

	return {
		get phase() {
			return phase;
		},
		feed(input) {
			const abs = Math.max(Math.abs(input.dx), Math.abs(input.dy));
			if (abs === 0) return;
			const ongoing = phase !== 'idle' && input.t - lastT <= silence();
			lastT = input.t;

			if (ongoing && phase === 'coast') {
				// Fingers back on the trackpad while the momentum still runs: the
				// browser says so, or the deltas grow or turn, as momentum never does.
				const turned =
					(input.dx !== 0 && Math.sign(input.dx) === -coastDir.x) ||
					(input.dy !== 0 && Math.sign(input.dy) === -coastDir.y);
				if (input.momentum === true) return;
				if (input.momentum === false || abs > Math.max(2, coastMin * 2) || turned) {
					start(input.t);
				} else {
					read(input);
					held = { x: held.x + input.dx, y: held.y + input.dy };
					coastMin = Math.min(coastMin, abs);
					if (!neverLifted(abs)) return;
					// Steady fingers mistaken for momentum: they never lifted. Take
					// up the drag again, with the travel held back meanwhile.
					const travel = held;
					start(input.t);
					pos = { ...travel };
					samples.push({ t: input.t, ...pos });
					handlers.drag(travel.x, travel.y);
					return;
				}
			} else if (!ongoing) {
				// A first event, or one after a silence: a new touch. One the browser
				// marks as momentum is the tail of a gesture already gone.
				if (input.momentum === true) {
					coast(input, abs);
					return;
				}
				start(input.t);
			}

			if (input.momentum === undefined) read(input);
			if (input.momentum === true || (input.momentum === undefined && lifted())) {
				// The fingers lifted. Their speed is read from what they did up to now.
				const v = releaseVelocity(samples, input.t);
				coast(input, abs);
				handlers.up(v.x, v.y);
				return;
			}
			pos = { x: pos.x + input.dx, y: pos.y + input.dy };
			samples.push({ t: input.t, ...pos });
			if (samples.length > 40) samples.splice(0, samples.length - 40);
			handlers.drag(input.dx, input.dy);
		},
		tick(now) {
			if (phase === 'idle' || now - lastT <= silence()) return;
			// The fingers stopped before lifting, so they lift with no speed.
			if (phase === 'touch') handlers.up(0, 0);
			phase = 'idle';
		}
	};
}
