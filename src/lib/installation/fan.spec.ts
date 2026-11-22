import { describe, expect, it } from 'vitest';
import { fanBounds, layoutFan, MAX_FANNED } from './fan';

/** A fanned print's bounds, untilted, in shares of the box. */
const span = (p: ReturnType<typeof layoutFan>['prints'][number]) => ({
	left: p.fan.x - p.w / 2,
	right: p.fan.x + p.w / 2
});

describe('layoutFan', () => {
	it('leaves a lone photograph as itself, filling its box', () => {
		const fan = layoutFan([1.5]);
		expect(fan.prints).toHaveLength(1);
		const [print] = fan.prints;
		expect(print.w).toBeCloseTo(1);
		expect(print.h).toBeCloseTo(1);
		expect(print.pile).toEqual({ x: 0, y: 0, rotate: 0, scale: 1 });
		expect(fan.width).toBeCloseTo(1);
		expect(fan.height).toBeCloseTo(1);
	});

	it('piles the first print on top, square, with two beneath turned opposite ways', () => {
		const { prints } = layoutFan([1.5, 1.5, 1.5, 1.5]);
		expect(prints[0].pile.rotate).toBe(0);
		expect(Math.sign(prints[1].pile.rotate)).toBe(-Math.sign(prints[2].pile.rotate));
		// Deeper ones lie square under the top print, out of sight.
		expect(prints[3].pile.rotate).toBe(0);
		expect(prints[3].pile.scale).toBeLessThan(prints[0].pile.scale);
	});

	it('fits every piled print inside the box, whatever its shape', () => {
		for (const p of layoutFan([1.5, 0.6, 3, 1]).prints) {
			expect(p.w * p.pile.scale).toBeLessThanOrEqual(1 + 1e-9);
			expect(p.h * p.pile.scale).toBeLessThanOrEqual(1 + 1e-9);
		}
	});

	it('gives every fanned print the box’s area, so the top one keeps its size', () => {
		const box = 1.5;
		const { prints } = layoutFan([box, 0.6, 2, 1]);
		expect(prints[0].w).toBeCloseTo(1);
		expect(prints[0].h).toBeCloseTo(1);
		// Shares of the box's width and height, so area is w * h of the box's.
		for (const p of prints) expect(p.w * p.h).toBeCloseTo(1);
		// And its own shape: width over height, in the box's units.
		expect((prints[1].w * box) / prints[1].h).toBeCloseTo(0.6);
	});

	it('lays the fan out left to right in the set’s order, centered, overlapping a little', () => {
		const { prints } = layoutFan([1.5, 1.5, 1.5, 1.5, 1.5]);
		for (let k = 1; k < prints.length; k++) {
			const before = span(prints[k - 1]);
			const now = span(prints[k]);
			expect(now.left).toBeGreaterThan(before.left);
			expect(now.left).toBeLessThan(before.right);
		}
		expect(prints[0].fan.x).toBeCloseTo(-prints[4].fan.x);
		expect(prints[2].fan.x).toBeCloseTo(0);
	});

	it('bends a row along an arc, its ends lower and turned outward', () => {
		const { prints } = layoutFan([1, 1, 1, 1, 1]);
		expect(prints[0].fan.y).toBeGreaterThan(prints[2].fan.y);
		expect(prints[4].fan.y).toBeCloseTo(prints[0].fan.y);
		expect(prints[0].fan.rotate).toBeLessThan(0);
		expect(prints[4].fan.rotate).toBeGreaterThan(0);
		expect(prints[2].fan.rotate).toBeCloseTo(0);
	});

	it('takes more rows for a larger set, each about as long', () => {
		const one = layoutFan(Array(6).fill(1));
		const two = layoutFan(Array(7).fill(1));
		expect(new Set(one.prints.map((p) => Math.round(p.fan.y * 100))).size).toBeLessThanOrEqual(3);
		const rows = (fan: typeof two) => {
			const upper = fan.prints.filter((p) => p.fan.y < 0).length;
			return [upper, fan.prints.length - upper];
		};
		expect(rows(two)).toEqual([4, 3]);
		expect(two.height).toBeGreaterThan(one.height * 1.5);
		expect(two.width).toBeLessThan(one.width);
	});

	it('fans out no more than its most', () => {
		expect(layoutFan(Array(MAX_FANNED + 5).fill(1)).prints).toHaveLength(MAX_FANNED);
	});

	it('bounds every fanned print, turned, within the fan’s size', () => {
		const box = 1.5;
		const fan = layoutFan([box, 0.7, 1, 2, 1.3, 0.8, 1.5, 1.1]);
		for (const p of fan.prints) {
			const theta = (p.fan.rotate * Math.PI) / 180;
			// In units of the box's height, where turning keeps a print's shape.
			const w = p.w * box;
			const halfW = (w * Math.abs(Math.cos(theta)) + p.h * Math.abs(Math.sin(theta))) / 2;
			const halfH = (w * Math.abs(Math.sin(theta)) + p.h * Math.abs(Math.cos(theta))) / 2;
			expect(Math.abs(p.fan.x * box) + halfW).toBeLessThanOrEqual((fan.width * box) / 2 + 1e-9);
			expect(Math.abs(p.fan.y) + halfH).toBeLessThanOrEqual(fan.height / 2 + 1e-9);
		}
	});

	it('brings the prints out one after another, all done by the end', () => {
		const { prints } = layoutFan([1, 1, 1, 1]);
		expect(prints[0].delay).toBe(0);
		for (let k = 1; k < prints.length; k++) {
			expect(prints[k].delay).toBeGreaterThan(prints[k - 1].delay);
		}
		for (const p of prints) expect(p.delay + p.span).toBeLessThanOrEqual(1 + 1e-9);
		expect(prints[3].delay + prints[3].span).toBeCloseTo(1);
	});

	it('copes with a photograph of no known shape', () => {
		const fan = layoutFan([0, Number.NaN, 1.5]);
		for (const p of fan.prints) {
			expect(Number.isFinite(p.w) && Number.isFinite(p.h)).toBe(true);
		}
	});
});

describe('fanBounds', () => {
	it('grows from the box to the fan', () => {
		const fan = { width: 4, height: 1.5 };
		expect(fanBounds(fan, 0)).toEqual({ width: 1, height: 1 });
		expect(fanBounds(fan, 1)).toEqual({ width: 4, height: 1.5 });
		expect(fanBounds(fan, 0.5)).toEqual({ width: 2.5, height: 1.25 });
	});
});
