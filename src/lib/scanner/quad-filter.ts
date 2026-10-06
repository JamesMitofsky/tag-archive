import type { CornerPoints, Point } from './detect';

/**
 * Steadies the stream of live detections before anything is drawn or cropped.
 *
 * scanic re-finds the page from scratch on every frame, so a page held still
 * still comes back a few pixels off each time. Easing the overlay towards each
 * detection only hides the steps between samples; the noise in the samples
 * themselves survives, and reads as jitter. This filters the samples.
 *
 * Each corner runs through a One Euro filter (Casiez, Roussel & Vogel, CHI
 * 2012): a low-pass whose cutoff rises with the corner's speed. A page held
 * still gets heavy smoothing; a page being moved gets little, so the quad
 * keeps up instead of trailing behind.
 *
 * A single detection that lands far from the previous one (the detector
 * briefly locking onto a different rectangle) is held back until the next one
 * agrees with it. A real move to somewhere new costs one extra sample of lag;
 * a one-frame misfire never reaches the screen.
 */

export type QuadFilterOptions = {
	/**
	 * Length that positions and speeds are measured against: the detection
	 * frame's long edge. Keeps the tuning below independent of resolution.
	 */
	scale: number;
	/** Cutoff (Hz) while the page is still. Lower is steadier but laggier. */
	minCutoff: number;
	/** Cutoff added per unit of speed (frame-lengths per second). Higher tracks motion more tightly. */
	beta: number;
	/** Cutoff (Hz) for the speed estimate itself. */
	speedCutoff?: number;
	/** A corner moving further than this (fraction of `scale`) in one sample is a jump to confirm. */
	jumpThreshold: number;
};

type CornerState = { x: number; y: number; vx: number; vy: number };

const KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;

/** Weight of a new sample for a first-order low-pass at `cutoff` Hz, `dt` seconds on. */
function alpha(dt: number, cutoff: number): number {
	const r = 2 * Math.PI * cutoff * dt;
	return r / (r + 1);
}

/** Largest single-corner distance between two quads, in raw pixels. */
function maxCornerDistance(a: CornerPoints, b: CornerPoints): number {
	return Math.max(...KEYS.map((k) => Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y)));
}

export class QuadFilter {
	private readonly opts: Required<QuadFilterOptions>;
	private state: Record<(typeof KEYS)[number], CornerState> | null = null;
	private lastAt = 0;
	/**
	 * The last detection let through, unfiltered. Jumps are judged against
	 * this rather than the filtered quad: the filter trails a fast pan by
	 * design, and that lag must not read as a jump.
	 */
	private lastRaw: CornerPoints | null = null;
	/** An out-of-range detection waiting for a second one to confirm it. */
	private pending: CornerPoints | null = null;

	constructor(options: QuadFilterOptions) {
		this.opts = { speedCutoff: 1, ...options };
	}

	/** The current filtered quad, or `null` before the first detection. */
	get value(): CornerPoints | null {
		if (!this.state) return null;
		const s = this.state;
		const point = (c: CornerState): Point => ({ x: c.x, y: c.y });
		return {
			topLeft: point(s.topLeft),
			topRight: point(s.topRight),
			bottomRight: point(s.bottomRight),
			bottomLeft: point(s.bottomLeft)
		};
	}

	/** Forget everything, e.g. once the page has been lost for a while. */
	reset(): void {
		this.state = null;
		this.lastRaw = null;
		this.pending = null;
	}

	/** Feed one detection taken at `atMs`; returns the filtered quad. */
	push(corners: CornerPoints, atMs: number): CornerPoints {
		const current = this.value;
		if (!current || !this.lastRaw) return this.seed(corners, atMs);

		const jump = this.opts.jumpThreshold * this.opts.scale;
		if (maxCornerDistance(corners, this.lastRaw) > jump) {
			// Two far-off detections that agree with each other: the page really
			// moved. Start over there; the overlay's own easing covers the hop.
			if (this.pending && maxCornerDistance(corners, this.pending) <= jump) {
				return this.seed(corners, atMs);
			}
			this.pending = corners;
			return current;
		}
		this.pending = null;
		this.lastRaw = corners;

		const dt = (atMs - this.lastAt) / 1000;
		if (dt <= 0) return current;
		this.lastAt = atMs;

		const { scale, minCutoff, beta, speedCutoff } = this.opts;
		const speedWeight = alpha(dt, speedCutoff);
		for (const key of KEYS) {
			const c = this.state![key];
			const p = corners[key];
			c.vx += speedWeight * ((p.x - c.x) / dt - c.vx);
			c.vy += speedWeight * ((p.y - c.y) / dt - c.vy);
			const speed = Math.hypot(c.vx, c.vy) / scale;
			const weight = alpha(dt, minCutoff + beta * speed);
			c.x += weight * (p.x - c.x);
			c.y += weight * (p.y - c.y);
		}
		return this.value!;
	}

	private seed(corners: CornerPoints, atMs: number): CornerPoints {
		const corner = (p: Point): CornerState => ({ x: p.x, y: p.y, vx: 0, vy: 0 });
		this.state = {
			topLeft: corner(corners.topLeft),
			topRight: corner(corners.topRight),
			bottomRight: corner(corners.bottomRight),
			bottomLeft: corner(corners.bottomLeft)
		};
		this.lastAt = atMs;
		this.lastRaw = corners;
		this.pending = null;
		return this.value!;
	}
}
