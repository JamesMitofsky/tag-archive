import { describe, expect, it } from 'vitest';
import { cornerList, type CornerPoints, type Point } from './detect';
import { refineCorners, type Luma } from './refine';

const W = 360;
const H = 480;

/** A page in perspective, deliberately off the pixel grid. */
const TRUTH: CornerPoints = {
	topLeft: { x: 62.3, y: 78.6 },
	topRight: { x: 301.7, y: 91.2 },
	bottomRight: { x: 318.4, y: 402.9 },
	bottomLeft: { x: 44.8, y: 389.1 }
};

/** Deterministic noise in [-1, 1]. */
function noise(seed: number) {
	let s = seed;
	return () => {
		s = (s * 16807) % 2147483647;
		return (s / 2147483647) * 2 - 1;
	};
}

function inside(pts: Point[], x: number, y: number) {
	for (let i = 0; i < 4; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % 4];
		if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
	}
	return true;
}

/** Shrink a quad towards its centre by `k` (0.04 = 4%). */
function inset(corners: CornerPoints, k: number): Point[] {
	const pts = cornerList(corners);
	const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
	const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
	return pts.map((p) => ({ x: p.x + (cx - p.x) * k, y: p.y + (cy - p.y) * k }));
}

/**
 * Render the page with 4×4 supersampling, so edges are anti-aliased the way a
 * camera's are, then add sensor noise.
 */
function render(
	options: { page?: number; desk?: number; noise?: number; seed?: number; border?: number } = {}
): Luma {
	const { page = 230, desk = 110, noise: amount = 5, seed = 1, border } = options;
	const outer = cornerList(TRUTH);
	const ringOuter = border ? inset(TRUTH, border) : null;
	const ringInner = border ? inset(TRUTH, border + 0.012) : null;
	const rand = noise(seed);
	const data = new Float32Array(W * H);
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			let sum = 0;
			for (let sy = 0; sy < 4; sy++) {
				for (let sx = 0; sx < 4; sx++) {
					const px = x + (sx + 0.5) / 4;
					const py = y + (sy + 0.5) / 4;
					let v = desk;
					if (inside(outer, px, py)) {
						const onRing =
							ringOuter && ringInner && inside(ringOuter, px, py) && !inside(ringInner, px, py);
						v = onRing ? 40 : page;
					}
					sum += v;
				}
			}
			data[y * W + x] = sum / 16 + rand() * amount;
		}
	}
	return { width: W, height: H, data };
}

/** What scanic hands over: integer corners, several pixels off. */
function coarse(seed: number, spread = 6): CornerPoints {
	const rand = noise(seed);
	const off = (p: Point) => ({
		x: Math.round(p.x + rand() * spread),
		y: Math.round(p.y + rand() * spread)
	});
	return {
		topLeft: off(TRUTH.topLeft),
		topRight: off(TRUTH.topRight),
		bottomRight: off(TRUTH.bottomRight),
		bottomLeft: off(TRUTH.bottomLeft)
	};
}

function worstError(found: CornerPoints) {
	const a = cornerList(found);
	const b = cornerList(TRUTH);
	return Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
}

describe('refineCorners', () => {
	it('lands on the true corners to a fraction of a pixel', () => {
		const refined = refineCorners(render(), coarse(3));

		expect(refined).not.toBeNull();
		expect(worstError(refined!)).toBeLessThan(0.5);
	});

	it('gives the same corners however the detection hops', () => {
		// The jitter this exists to remove: a still page, a detector that
		// picks a different pixel each frame.
		const img = render();
		const xs = Array.from({ length: 20 }, (_, i) => refineCorners(img, coarse(10 + i))!.topLeft.x);
		const spread = Math.max(...xs) - Math.min(...xs);

		expect(spread).toBeLessThan(0.1);
	});

	it('holds still through sensor noise', () => {
		const xs = Array.from(
			{ length: 10 },
			(_, i) => refineCorners(render({ noise: 12, seed: 100 + i }), coarse(5))!.bottomRight.y
		);

		expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.5);
	});

	it('works for a page darker than what it sits on', () => {
		const refined = refineCorners(render({ page: 50, desk: 215 }), coarse(4));

		expect(worstError(refined!)).toBeLessThan(0.5);
	});

	it('takes the paper edge over a printed border just inside it', () => {
		// The detector locked onto the border; the paper edge is ~7px further out.
		const onBorder = inset(TRUTH, 0.04);
		const detection: CornerPoints = {
			topLeft: onBorder[0],
			topRight: onBorder[1],
			bottomRight: onBorder[2],
			bottomLeft: onBorder[3]
		};
		const refined = refineCorners(render({ border: 0.04 }), detection);

		expect(worstError(refined!)).toBeLessThan(1);
	});

	it('declines when there is no edge to measure', () => {
		expect(refineCorners(render({ page: 150, desk: 150 }), coarse(3))).toBeNull();
	});

	it('declines when the detection is nowhere near the page', () => {
		const far: CornerPoints = {
			topLeft: { x: 120, y: 160 },
			topRight: { x: 240, y: 160 },
			bottomRight: { x: 240, y: 320 },
			bottomLeft: { x: 120, y: 320 }
		};

		expect(refineCorners(render(), far)).toBeNull();
	});
});
