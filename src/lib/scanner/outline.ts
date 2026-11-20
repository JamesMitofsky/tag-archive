import type { CornerPoints, Point } from './detect';
import { distance, fitLine, intersect, type Line } from './refine';

/**
 * From a segmentation mask to the four corners of the thing it marks.
 *
 * The mask says which pixels belong to the object in the photo. That is a
 * blob, not a quad: its corners are rounded, a thumb holding the object bites
 * a notch out of one side, a pencil lying beside it adds a bump to another.
 * So the corners are never read off the blob's outline directly. Instead:
 *
 *  1. keep the largest connected blob;
 *  2. take its convex hull, which bridges notches;
 *  3. cut the hull down to four sides, each time dropping the side whose
 *     neighbors, extended until they meet, add the least area. A rounded
 *     corner is a run of short sides, so it collapses to the point where the
 *     two straight sides would have met;
 *  4. refit each side as the line most of the outline points near it agree
 *     on, so a bump along part of a side can't push the whole side out;
 *  5. cross adjacent lines to get the corners.
 *
 * Pure and synchronous, so it is unit-tested in the node project.
 */

/** A probability-per-pixel mask, row-major. */
export type Mask = { width: number; height: number; data: Float32Array };

/** Probability at or above which a pixel belongs to the object. */
const THRESHOLD = 0.5;
/** Smallest share of the frame a blob may cover and still be the subject. */
const MIN_COVERAGE = 0.04;
/**
 * Smallest share of the quad the blob must fill. A blob much smaller than the
 * quad around it is not a flat four-sided thing (an open hand, an L-shaped
 * pile), and a quad drawn around one is a guess.
 */
const MIN_FILL = 0.7;
/**
 * How close (in mask pixels) an outline point must lie to a candidate line to
 * support it. The outline is a pixel staircase, so a straight side's points
 * scatter by about a pixel around it.
 */
const INLIER = 1.5;
/** Candidate lines tried per side. */
const TRIALS = 200;
/** Smallest share of a side's outline points its line must explain. */
const MIN_SUPPORT = 0.4;
/** Fewest outline points a side's refit may rest on. */
const MIN_SIDE_POINTS = 8;
/** Furthest a refitted side may turn from the hull's (cosine of 30°). */
const MAX_TURN = Math.cos(Math.PI / 6);
/** How far (as a fraction of the mask's long edge) a refitted corner may move from the hull's before the refit is distrusted. */
const MAX_SHIFT = 0.2;

/**
 * The largest 4-connected blob in `mask`: its outline pixels and its area, or
 * null if nothing in the mask is big enough to be the subject.
 */
function largestBlob(mask: Mask): { outline: Point[]; area: number } | null {
	const { width, height, data } = mask;
	const size = width * height;
	// 0 = background or unvisited, otherwise the 1-based blob label.
	const labels = new Int32Array(size);
	const stack = new Int32Array(size);
	let bestLabel = 0;
	let bestArea = 0;
	let next = 0;

	for (let start = 0; start < size; start++) {
		if (labels[start] !== 0 || !(data[start] >= THRESHOLD)) continue;
		next++;
		let area = 0;
		let top = 0;
		stack[top++] = start;
		labels[start] = next;
		while (top > 0) {
			const i = stack[--top];
			area++;
			const x = i % width;
			if (x > 0 && labels[i - 1] === 0 && data[i - 1] >= THRESHOLD) {
				labels[i - 1] = next;
				stack[top++] = i - 1;
			}
			if (x < width - 1 && labels[i + 1] === 0 && data[i + 1] >= THRESHOLD) {
				labels[i + 1] = next;
				stack[top++] = i + 1;
			}
			if (i >= width && labels[i - width] === 0 && data[i - width] >= THRESHOLD) {
				labels[i - width] = next;
				stack[top++] = i - width;
			}
			if (i < size - width && labels[i + width] === 0 && data[i + width] >= THRESHOLD) {
				labels[i + width] = next;
				stack[top++] = i + width;
			}
		}
		if (area > bestArea) {
			bestArea = area;
			bestLabel = next;
		}
	}

	if (bestArea < MIN_COVERAGE * size) return null;

	// Outline: blob pixels with a neighbor outside the blob, as the pixel's
	// outer edge midpoint(s), so the outline sits on the blob's boundary
	// rather than half a pixel inside it.
	const outline: Point[] = [];
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			if (labels[i] !== bestLabel) continue;
			if (x === 0 || labels[i - 1] !== bestLabel) outline.push({ x, y: y + 0.5 });
			if (x === width - 1 || labels[i + 1] !== bestLabel) outline.push({ x: x + 1, y: y + 0.5 });
			if (y === 0 || labels[i - width] !== bestLabel) outline.push({ x: x + 0.5, y });
			if (y === height - 1 || labels[i + width] !== bestLabel) {
				outline.push({ x: x + 0.5, y: y + 1 });
			}
		}
	}
	return { outline, area: bestArea };
}

const cross = (o: Point, a: Point, b: Point) =>
	(a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull (Andrew's monotone chain), collinear points dropped. */
export function convexHull(points: Point[]): Point[] {
	const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
	if (pts.length < 3) return pts;
	const half = (source: Point[]) => {
		const chain: Point[] = [];
		for (const p of source) {
			while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) {
				chain.pop();
			}
			chain.push(p);
		}
		chain.pop();
		return chain;
	};
	return [...half(pts), ...half(pts.reverse())];
}

function polygonArea(pts: Point[]): number {
	let sum = 0;
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		sum += a.x * b.y - b.x * a.y;
	}
	return Math.abs(sum) / 2;
}

/** The line through a and b, in the form refine.ts fits. */
function lineThrough(a: Point, b: Point): Line | null {
	const length = Math.hypot(b.x - a.x, b.y - a.y);
	if (length < 1e-6) return null;
	const dx = (b.x - a.x) / length;
	const dy = (b.y - a.y) / length;
	return { x: a.x, y: a.y, dx, dy, nx: -dy, ny: dx };
}

/**
 * Cut a convex polygon down to four sides. Each round removes one side and
 * extends its two neighbors to meet beyond it, choosing the side for which
 * that adds the least area, so the result still encloses the polygon.
 */
export function reduceToQuad(hull: Point[]): Point[] | null {
	const pts = [...hull];
	while (pts.length > 4) {
		const n = pts.length;
		let best = -1;
		let bestCost = Infinity;
		let bestApex: Point | null = null;
		for (let i = 0; i < n; i++) {
			// Removing side b→c: its neighbors a→b and c→d meet at the apex.
			const a = pts[(i + n - 1) % n];
			const b = pts[i];
			const c = pts[(i + 1) % n];
			const d = pts[(i + 2) % n];
			const before = lineThrough(a, b);
			const after = lineThrough(d, c);
			if (!before || !after) continue;
			const apex = intersect(before, after);
			if (!apex) continue;
			// The neighbors must converge beyond the side, not behind it.
			const ahead = (apex.x - b.x) * before.dx + (apex.y - b.y) * before.dy;
			const behind = (apex.x - c.x) * after.dx + (apex.y - c.y) * after.dy;
			if (ahead < 0 || behind < 0) continue;
			const cost = Math.abs(cross(b, apex, c)) / 2;
			if (cost < bestCost) {
				bestCost = cost;
				best = i;
				bestApex = apex;
			}
		}
		if (best < 0 || !bestApex) return null;
		pts[best] = bestApex;
		pts.splice((best + 1) % n, 1);
	}
	return pts.length === 4 ? pts : null;
}

/** Distance from p to the segment a→b. */
function segmentDistance(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const length2 = dx * dx + dy * dy;
	const t =
		length2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * The straight line most of `points` lie on, or null if no line holds enough
 * of them. Consensus rather than least squares: a bump or a rounded corner
 * drags a least-squares line toward itself, where here its points are simply
 * outvoted. `along` is the hull's side, which the line may not turn far from.
 */
function consensusLine(points: Point[], along: Line): Line | null {
	const n = points.length;
	if (n < MIN_SIDE_POINTS) return null;

	// A fixed sequence, so the same photo always gives the same corners.
	let seed = 12345;
	const random = () => {
		seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
		return seed / 0x80000000;
	};

	let best: Line | null = null;
	let bestCount = 0;
	for (let trial = 0; trial < TRIALS; trial++) {
		const line = lineThrough(points[Math.floor(random() * n)], points[Math.floor(random() * n)]);
		if (!line || Math.abs(line.dx * along.dx + line.dy * along.dy) < MAX_TURN) continue;
		let count = 0;
		for (const p of points) if (Math.abs(distance(line, p)) <= INLIER) count++;
		if (count > bestCount) {
			bestCount = count;
			best = line;
		}
	}
	if (!best || bestCount < Math.max(MIN_SIDE_POINTS, MIN_SUPPORT * n)) return null;

	const chosen = best;
	return fitLine(points.filter((p) => Math.abs(distance(chosen, p)) <= INLIER));
}

/** Start from the top-left-most corner and run clockwise (y points down). */
function ordered(pts: Point[]): CornerPoints {
	const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
	const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
	const ring = [...pts].sort(
		(p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx)
	);
	let first = 0;
	for (let i = 1; i < 4; i++) {
		if (ring[i].x + ring[i].y < ring[first].x + ring[first].y) first = i;
	}
	const at = (i: number) => ring[(first + i) % 4];
	return { topLeft: at(0), topRight: at(1), bottomRight: at(2), bottomLeft: at(3) };
}

/**
 * The quad around the object `mask` marks, in a `width`×`height` image the
 * mask was squashed from. Null when the mask holds no four-sided subject.
 */
export function quadFromMask(mask: Mask, width: number, height: number): CornerPoints | null {
	const blob = largestBlob(mask);
	if (!blob) return null;

	// Work in mask pixels stretched back to the photo's shape, so distances
	// and angles are the photo's (the model sees every photo as a square).
	const scale = Math.max(mask.width, mask.height);
	const longest = Math.max(width, height);
	const kx = ((width / longest) * scale) / mask.width;
	const ky = ((height / longest) * scale) / mask.height;
	const outline = blob.outline.map((p) => ({ x: p.x * kx, y: p.y * ky }));

	const hull = convexHull(outline);
	if (hull.length < 4) return null;
	const rough = reduceToQuad(hull);
	if (!rough) return null;

	// Each outline point votes for the hull side it is nearest.
	const nearest: Point[][] = [[], [], [], []];
	for (const p of outline) {
		let side = 0;
		let least = Infinity;
		for (let i = 0; i < 4; i++) {
			const d = segmentDistance(p, rough[i], rough[(i + 1) % 4]);
			if (d < least) {
				least = d;
				side = i;
			}
		}
		nearest[side].push(p);
	}

	let corners = rough;
	const hullSides = rough.map((p, i) => lineThrough(p, rough[(i + 1) % 4]));
	if (hullSides.every((line) => line !== null)) {
		// Mask pixels are not square once stretched to the photo's shape, but
		// the stretch is the same for every point, and INLIER is only a
		// tolerance: measuring it in stretched units is close enough.
		const sides = hullSides.map((line, i) => consensusLine(nearest[i], line!) ?? line!);
		const refit = rough.map((_, i) => intersect(sides[(i + 3) % 4], sides[i]));
		const limit = MAX_SHIFT * scale;
		if (refit.every((p, i) => p && Math.hypot(p.x - rough[i].x, p.y - rough[i].y) <= limit)) {
			corners = refit as Point[];
		}
	}

	const quadArea = polygonArea(corners);
	if (quadArea <= 0 || (blob.area * kx * ky) / quadArea < MIN_FILL) return null;

	// Back to photo pixels, and inside the photo: a side extended past a
	// rounded corner at the frame's edge can cross it by a pixel or two.
	const toPhoto = longest / scale;
	return ordered(
		corners.map((p) => ({
			x: Math.min(width, Math.max(0, p.x * toPhoto)),
			y: Math.min(height, Math.max(0, p.y * toPhoto))
		}))
	);
}
