import { describe, expect, it } from 'vitest';
import { A4, measureCloud, placeCloud, type FieldInput } from './cloudLayout';

/** `max-w-sm` on the searchbar. */
const BAR_W = 384;
/** Header drawing + margin + input, measured on `/`. */
const BAR_H = 131;
/** Must mirror GRID_PAD / GRID_GAP in cloudLayout.ts. */
const PAD = 16;
const GAP = 16;

/** The field when the bar sits in the middle of the viewport (tablet and up). */
const wide = (w: number, h: number): FieldInput => ({
	fieldW: w,
	fieldH: h,
	fullViewport: true,
	barW: BAR_W,
	barH: BAR_H
});

/** The field when the bar is stacked at the top and the cards tile beneath it. */
const stacked = (w: number, h: number): FieldInput => ({
	fieldW: w,
	fieldH: h,
	fullViewport: false,
	barW: BAR_W,
	barH: BAR_H
});

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

const place = (f: FieldInput) => {
	const layout = measureCloud(f);
	// The grid is uncapped, so pick an arbitrary page's worth for the assertions.
	return { layout, cards: placeCloud(items(Math.min(layout.cap, 24)), f, layout) };
};

describe('measureCloud', () => {
	it('picks the layout from whether the bar is surrounded', () => {
		expect(measureCloud(wide(1440, 900)).mode).toBe('surround');
		expect(measureCloud(stacked(375, 667)).mode).toBe('grid');
	});

	it('holds the A4 ratio in both layouts', () => {
		for (const f of [wide(1440, 900), stacked(375, 667), stacked(844, 390)]) {
			const { cardW, cardH } = measureCloud(f);
			expect(cardH / cardW).toBeCloseTo(A4, 5);
		}
	});
});

describe('measureCloud — surround', () => {
	it('reproduces the desktop layout exactly at 1440x900', () => {
		// This is the contract: the mobile work must not move desktop. 12rem cards,
		// 24 of them — both the values the old hardcoded constants produced.
		const { cardW, cap } = measureCloud(wide(1440, 900));
		expect(cardW).toBe(192);
		expect(cap).toBe(24);
	});

	it('keeps 12rem cards from tablet width up', () => {
		for (const [w, h] of [
			[768, 1024],
			[1024, 768],
			[1280, 800],
			[1920, 1080]
		]) {
			expect(measureCloud(wide(w, h)).cardW).toBe(192);
		}
	});

	it('never leaves the [3, 24] range', () => {
		for (let w = 200; w <= 2560; w += 37) {
			for (let h = 300; h <= 1600; h += 53) {
				const { cap } = measureCloud(wide(w, h));
				expect(cap).toBeGreaterThanOrEqual(3);
				expect(cap).toBeLessThanOrEqual(24);
			}
		}
	});

	it('does not shrink the cap as the field grows', () => {
		let previous = 0;
		for (let w = 320; w <= 2560; w += 16) {
			const { cap } = measureCloud(wide(w, (w * 900) / 1440));
			expect(cap).toBeGreaterThanOrEqual(previous);
			previous = cap;
		}
	});

	it('carves a hole around the bar', () => {
		expect(measureCloud(wide(1440, 900)).holeA).toBeGreaterThan(0);
		expect(measureCloud(wide(1440, 900)).holeB).toBeGreaterThan(0);
	});
});

describe('measureCloud — grid', () => {
	it('sizes two columns to exactly fill the row', () => {
		for (const [w, h] of [
			[375, 667],
			[390, 844],
			[360, 640],
			[412, 915]
		]) {
			const { cardW, cols } = measureCloud(stacked(w, h));
			expect(cols).toBe(2);
			expect(cols * cardW + GAP * (cols - 1) + 2 * PAD).toBeCloseTo(w, 5);
		}
	});

	it('never goes below the legibility floor on a very narrow screen', () => {
		// A 240px screen would want a 96px column; the floor holds it at 112.
		expect(measureCloud(stacked(240, 667)).cardW).toBe(112);
	});

	it('is uncapped, because the page scrolls', () => {
		// Nothing is truncated, which is why there is no "showing N of M".
		expect(measureCloud(stacked(375, 667)).cap).toBe(Number.POSITIVE_INFINITY);
	});

	it('carves no hole — the bar is above the grid, not inside it', () => {
		const { holeA, holeB } = measureCloud(stacked(375, 667));
		expect(holeA).toBe(0);
		expect(holeB).toBe(0);
	});

	it('gives a phone a bigger, more readable card than the cloud did', () => {
		// The scattered layout had to shrink cards to fit a screenful; tiling does not.
		expect(measureCloud(stacked(375, 667)).cardW).toBeGreaterThan(150);
	});
});

describe('placeCloud — surround', () => {
	it('leaves the middle of the field empty when there is a hole', () => {
		// Cards are allowed to slide under the searchbar — it is drawn on top of
		// them — so the hole is not a clearance guarantee. What it buys is that no
		// card PILES UP in the centre, which is what keeps the bar readable.
		for (const f of [wide(1440, 900), wide(768, 1024), wide(1920, 1080)]) {
			const { layout, cards } = place(f);
			// Narrowest point of the hole, in normalised field space, less jitter.
			const floor = Math.min(layout.holeA / layout.availX, layout.holeB / layout.availY) * 0.9;
			for (const c of cards) {
				expect(Math.hypot(c.dx / layout.availX, c.dy / layout.availY)).toBeGreaterThan(floor);
			}
		}
	});

	it('never centres a card on the searchbar itself', () => {
		for (const f of [wide(1440, 900), wide(768, 1024), wide(1920, 1080)]) {
			const { cards } = place(f);
			for (const c of cards) {
				const onBar = Math.abs(c.dx) < f.barW / 2 && Math.abs(c.dy) < f.barH / 2;
				expect(onBar).toBe(false);
			}
		}
	});

	it('places a given item identically every time', () => {
		const f = wide(1440, 900);
		const layout = measureCloud(f);
		const a = placeCloud(items(layout.cap), f, layout);
		const b = placeCloud(items(layout.cap), f, layout);
		expect(b.map((c) => [c.dx, c.dy])).toEqual(a.map((c) => [c.dx, c.dy]));
	});

	it('handles a single result without dividing by zero', () => {
		const f = wide(1440, 900);
		const [only] = placeCloud(items(1), f, measureCloud(f));
		expect(Number.isFinite(only.dx) && Number.isFinite(only.dy)).toBe(true);
	});
});

describe('placeCloud — grid', () => {
	it('leaves positioning to CSS', () => {
		const { cards } = place(stacked(375, 667));
		for (const c of cards) {
			expect([c.dx, c.dy]).toEqual([0, 0]);
		}
	});

	it('flies each column in from the side it faces', () => {
		const { cards } = place(stacked(375, 667));
		cards.forEach((c, i) => {
			expect(Math.sign(c.offX)).toBe(i % 2 === 0 ? -1 : 1);
		});
	});

	it('keeps the fly-in throw within a screen width', () => {
		const f = stacked(375, 667);
		for (const c of place(f).cards) {
			expect(Math.abs(c.offX)).toBeLessThanOrEqual(f.fieldW);
		}
	});

	it('flies cards in from a spread of heights, above and below', () => {
		const { cards } = place(stacked(390, 844));
		const signs = new Set(cards.map((c) => Math.sign(c.offY)));
		expect(signs.has(-1) && signs.has(1)).toBe(true);
		// And from a genuine range, not one band: spans most of a viewport height.
		const mags = cards.map((c) => Math.abs(c.offY));
		expect(Math.max(...mags) - Math.min(...mags)).toBeGreaterThan(844 * 0.4);
	});

	it('staggers the cascade so a row does not land in lockstep', () => {
		const { cards } = place(stacked(390, 844));
		const delayOf = (s: string) => Number(s.match(/--edelay:([\d.]+)s/)![1]);
		const delays = cards.map((c) => delayOf(c.enterStyle));
		// Later rows arrive later...
		expect(delays.at(-1)).toBeGreaterThan(delays[0]);
		// ...but the two cards sharing a row differ.
		expect(delays[0]).not.toBe(delays[1]);
	});

	it('still gives every card its own drift and entrance', () => {
		const { cards } = place(stacked(390, 844));
		for (const c of cards) {
			expect(c.style).toMatch(/--ddx:.+--dur:/);
			expect(c.enterStyle).toMatch(/--ex:.+--edelay:/);
		}
		// Distinct per card, so the grid doesn't pulse in lockstep.
		expect(new Set(cards.map((c) => c.style)).size).toBe(cards.length);
	});
});
