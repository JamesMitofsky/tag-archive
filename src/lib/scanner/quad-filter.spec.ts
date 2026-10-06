import { describe, expect, it } from 'vitest';
import type { CornerPoints } from './detect';
import { QuadFilter, type QuadFilterOptions } from './quad-filter';

const SCALE = 480;
const STEP_MS = 120;

const tuned: QuadFilterOptions = { scale: SCALE, minCutoff: 0.5, beta: 3, jumpThreshold: 0.15 };

/** A 200×280 page with its top-left corner at (x, y). */
const page = (x: number, y: number): CornerPoints => ({
	topLeft: { x, y },
	topRight: { x: x + 200, y },
	bottomRight: { x: x + 200, y: y + 280 },
	bottomLeft: { x, y: y + 280 }
});

/** Deterministic noise in [-1, 1], so the assertions never flake. */
function noise(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1103515245 + 12345) % 2147483648;
		return (s / 2147483648) * 2 - 1;
	};
}

function stdev(values: number[]) {
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

describe('QuadFilter', () => {
	it('passes the first detection straight through', () => {
		const filter = new QuadFilter(tuned);
		expect(filter.value).toBeNull();
		expect(filter.push(page(40, 60), 0)).toEqual(page(40, 60));
	});

	it('steadies a page held still', () => {
		const filter = new QuadFilter(tuned);
		const rand = noise(7);
		const raw: number[] = [];
		const out: number[] = [];

		for (let i = 0; i < 80; i++) {
			const x = 100 + rand() * 6;
			const filtered = filter.push(page(x, 100), i * STEP_MS);
			if (i >= 20) {
				raw.push(x);
				out.push(filtered.topLeft.x);
			}
		}

		expect(stdev(out)).toBeLessThan(stdev(raw) * 0.5);
	});

	it('keeps up with a page being moved', () => {
		// Half a frame-length per second: a steady pan.
		const pxPerStep = ((0.5 * SCALE) / 1000) * STEP_MS;
		const lagAfter = (options: QuadFilterOptions) => {
			const filter = new QuadFilter(options);
			let x = 0;
			let shown = 0;
			for (let i = 0; i < 20; i++) {
				x = 20 + i * pxPerStep;
				shown = filter.push(page(x, 100), i * STEP_MS).topLeft.x;
			}
			return x - shown;
		};

		const tracking = lagAfter(tuned);
		const steadyOnly = lagAfter({ ...tuned, beta: 0 });

		expect(tracking).toBeLessThan(steadyOnly / 2);
		expect(tracking).toBeLessThan(pxPerStep);
	});

	it('glides through a fast pan rather than holding and snapping', () => {
		// Just under the jump threshold per sample. The filtered quad trails by
		// more than that, which must not be mistaken for a jump.
		const pxPerStep = 0.14 * SCALE;
		const filter = new QuadFilter(tuned);
		let previous = -Infinity;

		for (let i = 0; i < 25; i++) {
			const x = i * pxPerStep;
			const shown = filter.push(page(x, 100), i * STEP_MS).topLeft.x;
			if (i > 0) {
				expect(shown).toBeGreaterThan(previous);
				expect(shown).toBeLessThan(x);
			}
			previous = shown;
		}
	});

	it('ignores a one-sample misfire', () => {
		const filter = new QuadFilter(tuned);
		filter.push(page(100, 100), 0);
		filter.push(page(100, 100), STEP_MS);

		expect(filter.push(page(300, 100), 2 * STEP_MS)).toEqual(page(100, 100));
		expect(filter.push(page(100, 100), 3 * STEP_MS)).toEqual(page(100, 100));
	});

	it('follows a jump once a second detection confirms it', () => {
		const filter = new QuadFilter(tuned);
		filter.push(page(100, 100), 0);

		expect(filter.push(page(300, 100), STEP_MS)).toEqual(page(100, 100));
		expect(filter.push(page(302, 100), 2 * STEP_MS)).toEqual(page(302, 100));
	});

	it('starts afresh after a reset', () => {
		const filter = new QuadFilter(tuned);
		filter.push(page(100, 100), 0);
		filter.reset();

		expect(filter.value).toBeNull();
		expect(filter.push(page(300, 100), STEP_MS)).toEqual(page(300, 100));
	});
});
