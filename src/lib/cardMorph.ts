/**
 * Geometry for the search cloud's open/close morph: one card growing out of its
 * grid slot into the centred page, and shrinking back into it.
 *
 * Pure, like `cloudLayout` — `CardCloud.svelte` measures the DOM and owns the
 * lifecycle, this owns the maths (see `cardMorph.spec.ts`).
 *
 * This interpolates a BOX — left, top, width, height — and not a transform,
 * which is the whole reason the hand-off at the end is invisible. `CardSheet`
 * sizes its type in container-query units, so a card laid out at one width and
 * then scaled to another is not the same picture as a card laid out at the
 * second width: on a phone the box grows 2.05x between the two states while the
 * type grows 1.12x. A scaled morph therefore arrives at the slot carrying
 * half-size text and swaps it for the real thing in a single frame. Animating
 * the box instead re-runs layout every frame, so the container queries stay
 * honest the whole way down and the last frame IS the destination.
 *
 * The one non-obvious thing left is that SIZE is interpolated geometrically,
 * `w0·(W/w0)^p`, not linearly. Size is judged as a RATIO, so a linear size
 * spends most of its apparent growth in the first third and then labours; at
 * the ~2x here that reads as a burst on the way out and a snap in the last
 * frames on the way back, and no easing curve fixes it, because it is not a
 * timing fault. POSITION stays linear in `p`: a straight line from slot to
 * centre is what "one object moved" wants, and warping that too reads as a
 * swerve.
 *
 * The pairing this REQUIRES, and which is easy to undo by accident: the curve
 * driving `p` must start at rest (ease-in-out, never ease-out). Once size is
 * geometric, progress and apparent size are the same quantity, so a
 * front-loading curve rebuilds the exact artefact the geometry just removed.
 */

/** A box in viewport coordinates. */
export interface Box {
	left: number;
	top: number;
	width: number;
	height: number;
}

const centre = (start: number, size: number) => start + size / 2;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/**
 * The box at progress `p` along the journey from `from` to `to`. `p = 0` is
 * exactly `from`, `p = 1` is exactly `to` — both ends are the real thing, which
 * is what lets the animation hand over to a static element without a seam.
 */
export function morphBox(from: Box, to: Box, p: number): Box {
	const k = Math.pow(to.width / from.width, p);
	const width = from.width * k;
	const height = from.height * k;
	return {
		left: lerp(centre(from.left, from.width), centre(to.left, to.width), p) - width / 2,
		top: lerp(centre(from.top, from.height), centre(to.top, to.height), p) - height / 2,
		width,
		height
	};
}

/**
 * Progress recovered from the width currently on screen — the inverse of the
 * curve above. A close can interrupt a grow that never finished, and restarting
 * the exit from full size would jump; this lets it pick up from wherever the
 * card actually is. Anything degenerate answers 1 (arrived).
 */
export function morphProgress(width: number, from: Box, to: Box): number {
	const ratio = to.width / from.width;
	if (!(width > 0) || !(ratio > 0) || ratio === 1) return 1;
	return Math.min(1, Math.max(0, Math.log(width / from.width) / Math.log(ratio)));
}
