import type { CornerPoints, Point } from './detect';

/**
 * Sub-pixel edge refinement for a detected quad.
 *
 * scanic's corners are vertices of a simplified outline: single integer
 * pixels, picked as whichever outline point sits furthest from a chord. At a
 * slightly soft or shadowed corner many points are near-equally far, so the
 * pick hops along the edge from frame to frame (by up to ~10px at 480px, on a
 * page held perfectly still). Filtering can only average that out after the fact.
 *
 * Instead this measures each side of the page directly. It samples the image
 * across the side at many points away from the corners, finds where the
 * brightness steps between page and surround to a fraction of a pixel, fits a
 * straight line through those points, and takes the corners as where adjacent
 * lines cross. Each corner is then backed by dozens of measurements instead
 * of one pixel, so it holds still when the page does.
 *
 * Pure and synchronous: it needs only the luma of the photo being cropped.
 */

/** A single-channel image. */
export type Luma = { width: number; height: number; data: Float32Array };

type Line = { x: number; y: number; dx: number; dy: number; nx: number; ny: number };

const KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;

/** Profile resolution, in pixels. */
const STEP = 0.5;
/**
 * Half-width of the step detector, in profile samples (2px). Wide enough that
 * a thin dark stroke near the edge (text, a crease) cannot outscore the page
 * boundary, which stays dark on the outside.
 */
const HALF = 4;
/** Profiles taken across each side. */
const SAMPLES = 40;
/** Fraction of each side skipped at both ends: corners are where edges are least reliable. */
const TRIM = 0.12;
/** Weakest step (in luma levels) that counts as an edge. */
const MIN_CONTRAST = 8;
/** Fraction of a side's profiles that must find the edge for the side to count. */
const MIN_HITS = 0.4;
const MIN_INLIERS = 0.3;

export function toLuma(image: ImageData): Luma {
	const { width, height, data } = image;
	const out = new Float32Array(width * height);
	for (let i = 0, j = 0; j < out.length; i += 4, j++) {
		out[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
	}
	return { width, height, data: out };
}

/**
 * Bilinear sample at canvas coordinates, where pixel i spans [i, i + 1) and
 * its value sits at its centre. NaN off the image, so that profile is dropped.
 */
function sample(img: Luma, cx: number, cy: number): number {
	const x = cx - 0.5;
	const y = cy - 0.5;
	if (x < 0 || y < 0 || x > img.width - 1.001 || y > img.height - 1.001) return Number.NaN;
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const fx = x - x0;
	const fy = y - y0;
	const i = y0 * img.width + x0;
	const d = img.data;
	const top = d[i] * (1 - fx) + d[i + 1] * fx;
	const bottom = d[i + img.width] * (1 - fx) + d[i + img.width + 1] * fx;
	return top * (1 - fy) + bottom * fy;
}

/** Total least squares: the line minimising perpendicular distance to `pts`. */
function fitLine(pts: Point[]): Line {
	let mx = 0;
	let my = 0;
	for (const p of pts) {
		mx += p.x;
		my += p.y;
	}
	mx /= pts.length;
	my /= pts.length;
	let sxx = 0;
	let sxy = 0;
	let syy = 0;
	for (const p of pts) {
		const dx = p.x - mx;
		const dy = p.y - my;
		sxx += dx * dx;
		sxy += dx * dy;
		syy += dy * dy;
	}
	const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
	const dx = Math.cos(theta);
	const dy = Math.sin(theta);
	return { x: mx, y: my, dx, dy, nx: -dy, ny: dx };
}

const distance = (line: Line, p: Point) => (p.x - line.x) * line.nx + (p.y - line.y) * line.ny;

function intersect(a: Line, b: Line): Point | null {
	const det = a.dx * b.dy - a.dy * b.dx;
	if (Math.abs(det) < 1e-3) return null;
	const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / det;
	return { x: a.x + t * a.dx, y: a.y + t * a.dy };
}

/**
 * Brightness across the side at (px, py), from `search` px inside to `search`
 * px outside, in STEP increments. False if the profile runs off the image.
 */
function readProfile(
	img: Luma,
	px: number,
	py: number,
	along: Point,
	normal: Point,
	search: number,
	out: Float32Array
): boolean {
	for (let k = 0; k < out.length; k++) {
		const s = -search + k * STEP;
		// Average three parallel rows to cut sensor noise.
		let v = 0;
		for (let w = -1; w <= 1; w++) {
			const q = sample(img, px + normal.x * s + along.x * w, py + normal.y * s + along.y * w);
			if (Number.isNaN(q)) return false;
			v += q;
		}
		out[k] = v / 3;
	}
	return true;
}

/**
 * Offset (px, outward) of the page boundary in `profile`, or null if there is
 * no clear one. `polarity` is +1 for a page lighter than its surround.
 */
function locateEdge(
	profile: Float32Array,
	search: number,
	polarity: number,
	response: Float32Array
): number | null {
	const n = profile.length;

	// Step response: mean just inside minus mean just outside, signed so the
	// page boundary is positive.
	let strongest = 0;
	response.fill(0);
	for (let k = HALF; k < n - HALF; k++) {
		let inner = 0;
		let outer = 0;
		for (let j = 1; j <= HALF; j++) {
			inner += profile[k - j];
			outer += profile[k + j];
		}
		response[k] = (polarity * (inner - outer)) / HALF;
		strongest = Math.max(strongest, response[k]);
	}
	if (strongest < MIN_CONTRAST) return null;

	// The sheet's own boundary is the outermost strong edge: a printed border or
	// ruled line just inside it can be as strong, but is never further out.
	const floor = Math.max(MIN_CONTRAST, 0.5 * strongest);
	let best = -1;
	for (let k = n - HALF - 1; k >= HALF; k--) {
		const r = response[k];
		if (r >= floor && r >= response[k - 1] && r >= response[k + 1]) {
			best = k;
			break;
		}
	}
	// A peak at the end of the window may be the edge of something beyond it.
	if (best < HALF + 1 || best > n - HALF - 2) return null;

	// Parabola through the peak and its neighbours: sub-sample position.
	const before = response[best - 1];
	const peak = response[best];
	const after = response[best + 1];
	const den = before - 2 * peak + after;
	const shift = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (before - after)) / den)) : 0;
	return -search + (best + shift) * STEP;
}

/** Fit the page boundary near the side a→b, or null if it can't be found. */
function fitSide(img: Luma, a: Point, b: Point, centre: Point, search: number): Line | null {
	const length = Math.hypot(b.x - a.x, b.y - a.y);
	if (length < 8) return null;
	const along = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
	let normal = { x: -along.y, y: along.x };
	if ((a.x - centre.x) * normal.x + (a.y - centre.y) * normal.y < 0) {
		normal = { x: -normal.x, y: -normal.y };
	}

	const n = Math.round((2 * search) / STEP) + 1;
	const profiles: { at: Point; values: Float32Array }[] = [];
	for (let i = 0; i < SAMPLES; i++) {
		const t = TRIM + (1 - 2 * TRIM) * (i / (SAMPLES - 1));
		const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
		const values = new Float32Array(n);
		if (readProfile(img, at.x, at.y, along, normal, search, values)) profiles.push({ at, values });
	}
	if (profiles.length < SAMPLES * MIN_HITS) return null;

	// Is the page lighter or darker than its surround here? Judged from the
	// whole side, not the strongest single step, which may belong to a dark
	// printed border rather than the paper.
	const quarter = Math.max(1, Math.floor(n / 4));
	let balance = 0;
	for (const { values } of profiles) {
		for (let k = 0; k < quarter; k++) balance += values[k] - values[n - 1 - k];
	}
	const polarity = balance >= 0 ? 1 : -1;

	const response = new Float32Array(n);
	const found: Point[] = [];
	for (const { at, values } of profiles) {
		const offset = locateEdge(values, search, polarity, response);
		if (offset !== null) found.push({ x: at.x + normal.x * offset, y: at.y + normal.y * offset });
	}
	if (found.length < SAMPLES * MIN_HITS) return null;

	// Refit without outliers, judged against the median residual.
	let line = fitLine(found);
	for (let round = 0; round < 3; round++) {
		const residuals = found.map((p) => Math.abs(distance(line, p))).sort((x, y) => x - y);
		const limit = Math.max(0.75, 2.5 * residuals[Math.floor(residuals.length / 2)]);
		const inliers = found.filter((p) => Math.abs(distance(line, p)) <= limit);
		if (inliers.length < SAMPLES * MIN_INLIERS) return null;
		line = fitLine(inliers);
	}
	return line;
}

function refinePass(img: Luma, pts: Point[], search: number): Point[] | null {
	const centre = {
		x: (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4,
		y: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4
	};
	const lines: Line[] = [];
	for (let side = 0; side < 4; side++) {
		const line = fitSide(img, pts[side], pts[(side + 1) % 4], centre, search);
		if (!line) return null;
		lines.push(line);
	}
	const corners: Point[] = [];
	for (let c = 0; c < 4; c++) {
		// Corner c joins the side ending at it and the side starting from it.
		const p = intersect(lines[(c + 3) % 4], lines[c]);
		if (!p) return null;
		corners.push(p);
	}
	return corners;
}

/**
 * Snap `corners` (in `img` pixels) to the page edges visible in `img`.
 * Returns null when the edges can't be measured confidently, so the caller can
 * decide what an unrefined detection is worth.
 */
export function refineCorners(img: Luma, corners: CornerPoints): CornerPoints | null {
	const scale = Math.max(img.width, img.height);
	const raw = KEYS.map((key) => corners[key]);

	// A wide first look absorbs the detector's own error (shadows can push its
	// outline several pixels off the paper); a narrow second one, centred on
	// the first fit, tightens it.
	const first = refinePass(img, raw, 0.025 * scale);
	if (!first) return null;
	const refined = refinePass(img, first, 0.01 * scale) ?? first;

	// Lines that cross far from the detection fitted something else.
	const limit = 0.06 * scale;
	if (refined.some((p, i) => Math.hypot(p.x - raw[i].x, p.y - raw[i].y) > limit)) return null;

	return {
		topLeft: refined[0],
		topRight: refined[1],
		bottomRight: refined[2],
		bottomLeft: refined[3]
	};
}
