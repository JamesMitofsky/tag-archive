import { describe, expect, it } from 'vitest';
import {
	A4,
	CAP_MAX,
	CAP_MIN,
	cardMargin,
	measureCloud,
	placeCloud,
	type FieldInput,
	type Rect
} from './cloudLayout';

/** `max-w-sm` on the searchbar. */
const BAR_W = 384;
/** Header drawing + margin + input, measured on `/`. */
const BAR_H = 131;
/** Must mirror GRID_PAD / GRID_GAP in cloudLayout.ts. */
const PAD = 16;
const GAP = 16;

/** The searchbar's own rectangle: centred in the viewport, in the surround layout. */
const barRect = (w: number, h: number): Rect => ({
	left: (w - BAR_W) / 2,
	top: (h - BAR_H) / 2,
	width: BAR_W,
	height: BAR_H
});
/** The nav, pinned top-right, and the home mark, pinned top-left. */
const chrome = (w: number): Rect[] => [
	{ left: w - 320, top: 12, width: 300, height: 40 },
	{ left: 12, top: 12, width: 190, height: 40 }
];

/** The field when the bar sits in the middle of the viewport (tablet and up). */
const wide = (w: number, h: number): FieldInput => ({
	fieldW: w,
	fieldH: h,
	fullViewport: true,
	blocks: [barRect(w, h), ...chrome(w)]
});

/** The field when the bar is stacked at the top and the cards tile beneath it. */
const stacked = (w: number, h: number): FieldInput => ({
	fieldW: w,
	fieldH: h,
	fullViewport: false
});

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

const place = (f: FieldInput) => {
	const layout = measureCloud(f);
	// The grid is uncapped, so pick an arbitrary page's worth for the assertions.
	return { layout, cards: placeCloud(items(Math.min(layout.cap, CAP_MAX)), f, layout) };
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
	it('pins the desktop layout at 1440x900', () => {
		// The card size is a deliberate constant, not an emergent one: 10rem pages,
		// 24 of them. Anything that moves either value moves the whole desktop view.
		const { cardW, cap } = measureCloud(wide(1440, 900));
		expect(cardW).toBe(192);
		// Bounded by the density dial here, not by the ceiling: a 1440 window is
		// where the two are closest, so this is the size that notices either moving.
		expect(cap).toBeGreaterThan(CAP_MIN);
		expect(cap).toBeLessThanOrEqual(CAP_MAX);
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

	it('never leaves the [CAP_MIN, CAP_MAX] range', () => {
		for (let w = 200; w <= 2560; w += 37) {
			for (let h = 300; h <= 1600; h += 53) {
				const { cap } = measureCloud(wide(w, h));
				expect(cap).toBeGreaterThanOrEqual(CAP_MIN);
				expect(cap).toBeLessThanOrEqual(CAP_MAX);
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

	it('carves out the chrome rather than assuming where it is', () => {
		// No zones at all is a legitimate input (a route with no nav): the cloud
		// then uses the whole window, which is strictly more room, never less.
		const bare = { ...wide(1440, 900), blocks: [] };
		expect(measureCloud(bare).cap).toBeGreaterThanOrEqual(measureCloud(wide(1440, 900)).cap);
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

	it("reserves no placement reach — CSS owns the grid's positions", () => {
		const { availX, availY } = measureCloud(stacked(375, 667));
		expect(availX).toBe(0);
		expect(availY).toBe(0);
	});

	it('gives a phone a bigger, more readable card than the cloud did', () => {
		// The scattered layout had to shrink cards to fit a screenful; tiling does not.
		expect(measureCloud(stacked(375, 667)).cardW).toBeGreaterThan(150);
	});
});

describe('placeCloud — surround', () => {
	/** The box a card actually occupies while it drifts and tilts. */
	const sweptBox = (c: { dx: number; dy: number }, f: FieldInput, cardW: number, cardH: number) => {
		const m = cardMargin(cardW, cardH);
		return {
			left: f.fieldW / 2 + c.dx - m.x,
			right: f.fieldW / 2 + c.dx + m.x,
			top: f.fieldH / 2 + c.dy - m.y,
			bottom: f.fieldH / 2 + c.dy + m.y
		};
	};

	const overlaps = (box: { left: number; right: number; top: number; bottom: number }, r: Rect) =>
		box.left < r.left + r.width &&
		box.right > r.left &&
		box.top < r.top + r.height &&
		box.bottom > r.top;

	const sizes: [number, number][] = [
		[920, 936],
		[1024, 768],
		[1280, 800],
		[1440, 900],
		[1920, 1080]
	];

	it('never lets a card leave the window, drift and tilt included', () => {
		// A card cropped by the window edge stops reading as paper floating in front
		// of the sky, which is the whole illusion.
		for (const [w, h] of sizes) {
			const f = wide(w, h);
			const { layout, cards } = place(f);
			for (const c of cards) {
				const box = sweptBox(c, f, layout.cardW, layout.cardH);
				// Sub-pixel tolerance: the lattice divides the reach in floating point.
				expect(box.left).toBeGreaterThan(-0.01);
				expect(box.top).toBeGreaterThan(-0.01);
				expect(box.right).toBeLessThan(w + 0.01);
				expect(box.bottom).toBeLessThan(h + 0.01);
			}
		}
	});

	it('never lets a card sit under the searchbar, the nav or the home mark', () => {
		for (const [w, h] of sizes) {
			const f = wide(w, h);
			const { layout, cards } = place(f);
			for (const c of cards) {
				const box = sweptBox(c, f, layout.cardW, layout.cardH);
				for (const zone of f.blocks ?? []) expect(overlaps(box, zone)).toBe(false);
			}
		}
	});

	it('fills the corners before the middle', () => {
		// The point of sampling farthest-first: with only a handful of cards the
		// cloud should be holding up the corners of the window, not huddling round
		// the bar. Every one of the first four lands in a different quadrant.
		const f = wide(1440, 900);
		const { cards } = place(f);
		const quadrants = new Set(
			cards.slice(0, 4).map((c) => `${Math.sign(c.dx)},${Math.sign(c.dy)}`)
		);
		expect(quadrants.size).toBe(4);
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
