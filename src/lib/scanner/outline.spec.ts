import { describe, expect, it } from 'vitest';
import type { CornerPoints, Point } from './detect';
import { convexHull, quadFromMask, reduceToQuad, type Mask } from './outline';

const SIZE = 320;

/** A mask painted from a predicate over pixel centers. */
function paint(inside: (x: number, y: number) => boolean, size = SIZE): Mask {
	const data = new Float32Array(size * size);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (inside(x + 0.5, y + 0.5)) data[y * size + x] = 1;
		}
	}
	return { width: size, height: size, data };
}

/** True inside the convex quad `q` (clockwise, y down). */
function inQuad(q: Point[], x: number, y: number): boolean {
	return q.every((a, i) => {
		const b = q[(i + 1) % 4];
		return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
	});
}

/** A page seen at a slight angle: no side is axis-aligned. */
const PAGE: Point[] = [
	{ x: 70, y: 50 },
	{ x: 250, y: 62 },
	{ x: 238, y: 280 },
	{ x: 60, y: 268 }
];

function expectCorners(found: CornerPoints | null, want: Point[], tolerance: number) {
	expect(found).not.toBeNull();
	const got = [found!.topLeft, found!.topRight, found!.bottomRight, found!.bottomLeft];
	got.forEach((p, i) => {
		expect(Math.hypot(p.x - want[i].x, p.y - want[i].y)).toBeLessThan(tolerance);
	});
}

describe('convexHull', () => {
	it('drops interior and collinear points', () => {
		const hull = convexHull([
			{ x: 0, y: 0 },
			{ x: 5, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
			{ x: 4, y: 6 }
		]);
		expect(hull).toHaveLength(4);
	});
});

describe('reduceToQuad', () => {
	it('restores the corner a clipped square lost', () => {
		// A 10×10 square with its top-right corner cut off.
		const quad = reduceToQuad([
			{ x: 0, y: 0 },
			{ x: 8, y: 0 },
			{ x: 10, y: 2 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 }
		]);
		expect(quad).not.toBeNull();
		expect(quad!.some((p) => Math.hypot(p.x - 10, p.y) < 1e-6)).toBe(true);
	});
});

describe('quadFromMask', () => {
	it('finds the corners of a tilted page', () => {
		const mask = paint((x, y) => inQuad(PAGE, x, y));
		expectCorners(quadFromMask(mask, SIZE, SIZE), PAGE, 1.5);
	});

	it('puts corners where the straight sides meet when the corners are rounded', () => {
		const radius = 18;
		const mask = paint((x, y) => {
			if (!inQuad(PAGE, x, y)) return false;
			// Round each corner off: outside the circle tucked into it is cut away.
			return PAGE.every((corner, i) => {
				const prev = PAGE[(i + 3) % 4];
				const next = PAGE[(i + 1) % 4];
				const unit = (to: Point) => {
					const length = Math.hypot(to.x - corner.x, to.y - corner.y);
					return { x: (to.x - corner.x) / length, y: (to.y - corner.y) / length };
				};
				const u = unit(prev);
				const v = unit(next);
				const along = (x - corner.x) * u.x + (y - corner.y) * u.y;
				const across = (x - corner.x) * v.x + (y - corner.y) * v.y;
				if (along > radius || across > radius) return true;
				const cx = corner.x + (u.x + v.x) * radius;
				const cy = corner.y + (u.y + v.y) * radius;
				return Math.hypot(x - cx, y - cy) <= radius * 1.05;
			});
		});
		expectCorners(quadFromMask(mask, SIZE, SIZE), PAGE, 3);
	});

	it('bridges a notch bitten out of a side (a thumb holding the page)', () => {
		const mask = paint((x, y) => inQuad(PAGE, x, y) && Math.hypot(x - 62, y - 170) > 28);
		expectCorners(quadFromMask(mask, SIZE, SIZE), PAGE, 2);
	});

	it('ignores a short bump on a side (something lying beside the page)', () => {
		const mask = paint((x, y) => inQuad(PAGE, x, y) || (x > 240 && x < 262 && y > 140 && y < 190));
		expectCorners(quadFromMask(mask, SIZE, SIZE), PAGE, 2.5);
	});

	it('keeps the largest blob when the mask holds several', () => {
		const mask = paint((x, y) => inQuad(PAGE, x, y) || (x > 280 && x < 310 && y > 5 && y < 30));
		expectCorners(quadFromMask(mask, SIZE, SIZE), PAGE, 1.5);
	});

	it('maps a squashed mask back to the photo it came from', () => {
		// A 600×1200 photo squashed to the square: x halves relative to y.
		const mask = paint((x, y) => x > 80 && x < 240 && y > 40 && y < 280);
		expectCorners(
			quadFromMask(mask, 600, 1200),
			[
				{ x: 150, y: 150 },
				{ x: 450, y: 150 },
				{ x: 450, y: 1050 },
				{ x: 150, y: 1050 }
			],
			6
		);
	});

	it('keeps corners inside the photo when the page fills the frame', () => {
		const found = quadFromMask(
			paint(() => true),
			400,
			300
		);
		expectCorners(
			found,
			[
				{ x: 0, y: 0 },
				{ x: 400, y: 0 },
				{ x: 400, y: 300 },
				{ x: 0, y: 300 }
			],
			1e-6
		);
	});

	it('finds nothing in an empty mask', () => {
		expect(
			quadFromMask(
				paint(() => false),
				SIZE,
				SIZE
			)
		).toBeNull();
	});

	it('finds nothing when the only blob is a speck', () => {
		const mask = paint((x, y) => x > 150 && x < 170 && y > 150 && y < 170);
		expect(quadFromMask(mask, SIZE, SIZE)).toBeNull();
	});

	it('refuses a shape that is not four-sided', () => {
		// An L: its hull is a quad it only half fills.
		const mask = paint(
			(x, y) =>
				(x > 60 && x < 100 && y > 40 && y < 280) || (x > 60 && x < 260 && y > 240 && y < 280)
		);
		expect(quadFromMask(mask, SIZE, SIZE)).toBeNull();
	});
});
