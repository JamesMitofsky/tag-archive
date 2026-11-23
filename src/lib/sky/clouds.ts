/**
 * The sky's clouds: which there are, how they drift, and where one stands
 * when a page steers them (see ./steer).
 *
 * Left alone, each cloud is a CSS animation along one track: its left edge
 * runs from DRIFT_FROM to DRIFT_FROM + DRIFT_SPAN (vw), off screen at both
 * ends, forever. A steered cloud keeps that track, as a phase along it, so it
 * can be handed back to the animation where it stands. Steering adds the
 * view's motion to it, as parallax: a cloud moves with the view by a share of
 * its motion, the more the nearer it is, and wraps round its track as it
 * leaves the screen. The view's zoom scales the clouds about the screen's
 * center in the same way, by a share of the zoom in log space.
 *
 * Pure and free of the DOM, so the geometry can be tested.
 */

/** Cloud widths (vw) are clamped to this range so no cloud dominates or vanishes. */
export const CLOUD_MIN_W = 9;
export const CLOUD_MAX_W = 28;

/**
 * Larger clouds read as nearer the viewer, so they drift faster. Duration is
 * inversely proportional to width, so the smallest (most distant) clouds
 * nearly hang still while big ones sweep across. Duration (s) = DRIFT_SCALE / width (vw).
 */
const DRIFT_SCALE = 10800;

/** Where a cloud's left edge starts its drift, and how far it runs (vw). */
export const DRIFT_FROM = -45;
export const DRIFT_SPAN = 190;

/**
 * The smallest a zoom draws a steered cloud. The tracks' ends stay hidden at
 * any scale down to this: the horizontal track's margin holds for the widest
 * cloud, and the vertical track's margin (VERTICAL_MARGIN) is sized for it.
 */
export const CLOUD_SMALLEST = 0.8;

/**
 * How far past the screen's top and bottom edges a steered cloud travels
 * before it wraps, as a share of the screen's height: enough that a cloud
 * drawn at CLOUD_SMALLEST, scaled toward the center, is still off screen,
 * and a little to spare, since that alone would leave it touching the edge.
 */
export const VERTICAL_MARGIN = 0.5 * (1 / CLOUD_SMALLEST - 1) + 0.02;

export type Cloud = {
	src: string;
	/** Its top edge, at rest (vh). */
	top: number;
	/** Its width (vw). */
	w: number;
	/** Its animation's delay (s): negative, so it starts part way along. */
	delay: number;
	op: number;
	/** How long one drift along the track takes (s). */
	dur: number;
};

const clampWidth = (w: number) => Math.min(Math.max(w, CLOUD_MIN_W), CLOUD_MAX_W);

// Negative delays pre-spread the clouds across the viewport, so the sky looks
// full at load instead of empty until the first cloud wanders in.
export const CLOUDS: readonly Cloud[] = [
	{ src: '/clouds/cloud-1.webp', top: 8, w: 12, delay: -284, op: 0.5 },
	{ src: '/clouds/cloud-3.webp', top: 34, w: 28, delay: -65, op: 0.5 },
	{ src: '/clouds/cloud-1.webp', top: 55, w: 9, delay: -790, op: 0.35 },
	{ src: '/clouds/cloud-3.webp', top: 74, w: 15, delay: -398, op: 0.45 }
].map((c) => {
	const w = clampWidth(c.w);
	return { ...c, w, dur: Math.round(DRIFT_SCALE / w) };
});

/** `a` wrapped into [0, n). */
const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * How near a cloud is, 0..1, the nearest (widest) being 1: the same cue its
 * drift speed follows, so the nearer clouds also move more with the view.
 */
export function nearness(cloud: Cloud): number {
	return cloud.w / CLOUD_MAX_W;
}

/** Where a cloud is along its track at rest, before anything has seeked its animation. */
export function restingPhase(cloud: Cloud): number {
	return mod(-cloud.delay / cloud.dur, 1);
}

/**
 * The time (s) to seek a cloud's animation to so that it stands at `phase`.
 * Never before the animation's (negative) delay, so it is always under way.
 */
export function phaseTime(cloud: Cloud, phase: number): number {
	return mod(phase, 1) * cloud.dur + cloud.delay;
}

/**
 * A steered cloud: how far along its track (0..1), and how far round its
 * vertical wrap (0..1). Both are shares, so they hold across a resize.
 */
export type Steering = { phase: number; rise: number };

/** The box the clouds' vw and vh are of (px). */
export type SkyBox = { width: number; height: number };

/** The view's motion over one frame. */
export type ViewMove = {
	/** How far the view's content moved on screen (px). */
	dx: number;
	dy: number;
	/** The view's zoom, 1 at rest. */
	zoom: number;
	/** The frame's length (s), for the clouds' own drift. */
	dt: number;
	/** The share of the view's motion the nearest cloud moves by. */
	parallax: number;
};

/** The length of a cloud's vertical wrap (px), off screen past both edges. */
function verticalSpan(cloud: Cloud, box: SkyBox, aspect: number) {
	const h = (cloud.w / 100) * box.width * aspect;
	const margin = box.height * VERTICAL_MARGIN;
	return { h, margin, span: box.height + h + 2 * margin };
}

/** Moves a steered cloud on by its own drift and its share of the view's motion. */
export function steerCloud(
	cloud: Cloud,
	steering: Steering,
	move: ViewMove,
	box: SkyBox,
	aspect: number
): void {
	const share = move.parallax * nearness(cloud);
	const track = (DRIFT_SPAN / 100) * box.width;
	steering.phase = mod(
		steering.phase + Math.max(0, move.dt) / cloud.dur + (move.dx * share) / track,
		1
	);
	steering.rise = mod(steering.rise + (move.dy * share) / verticalSpan(cloud, box, aspect).span, 1);
}

/**
 * How much bigger than at rest a cloud is drawn at `zoom`, for a cloud that
 * moves by `share` of the view: that share of the zoom in log space, which
 * is how a far plane scales when the camera moves toward a near one. Zooming
 * out, it eases into CLOUD_SMALLEST rather than stopping dead at it.
 */
export function cloudScale(zoom: number, share: number): number {
	const log = share * Math.log(zoom);
	if (!(log < 0)) return Number.isFinite(log) ? Math.exp(log) : 1;
	const floor = -Math.log(CLOUD_SMALLEST);
	return Math.exp(floor * Math.tanh(log / floor));
}

/**
 * Where a steered cloud is drawn: the offset (px) from its place in the
 * stylesheet (left edge 0, top edge at `top` vh) and its scale, to be set as
 * `translate3d(x, y, 0) scale(scale)` about its own center.
 */
export function placeCloud(
	cloud: Cloud,
	steering: Steering,
	zoom: number,
	parallax: number,
	box: SkyBox,
	aspect: number
): { x: number; y: number; scale: number } {
	const w = (cloud.w / 100) * box.width;
	const { h, margin, span } = verticalSpan(cloud, box, aspect);
	const left = (DRIFT_FROM / 100) * box.width + steering.phase * (DRIFT_SPAN / 100) * box.width;
	const restTop = (cloud.top / 100) * box.height;
	// At no rise this is restTop: it starts wrapping only once steered there.
	const top = -(h + margin) + mod(restTop + h + margin + steering.rise * span, span);
	const scale = cloudScale(zoom, parallax * nearness(cloud));
	// Scaled about the screen's center, as the view zooms about it.
	const cx = box.width / 2 + (left + w / 2 - box.width / 2) * scale;
	const cy = box.height / 2 + (top + h / 2 - box.height / 2) * scale;
	return { x: cx - w / 2, y: cy - h / 2 - restTop, scale };
}
