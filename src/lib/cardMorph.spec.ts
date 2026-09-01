import { describe, expect, it } from 'vitest';
import { morphBox, morphProgress, type Box } from './cardMorph';
import { A4 } from './cloudLayout';

/** Every card is a sheet of paper, in either state. */
const sheet = (left: number, top: number, width: number): Box => ({
	left,
	top,
	width,
	height: width * A4
});

/** A grid slot on a phone: half a 390px row, A4-tall. */
const slot = sheet(16, 620, 171);
/** The opened page: `min(90vw, 90vh * 210/297)` centred in a 390x844 viewport. */
const page = sheet(20.5, 74, 349);

const near = (got: Box, want: Box, digits = 1) => {
	expect(got.left).toBeCloseTo(want.left, digits);
	expect(got.top).toBeCloseTo(want.top, digits);
	expect(got.width).toBeCloseTo(want.width, digits);
	expect(got.height).toBeCloseTo(want.height, digits);
};

describe('morphBox', () => {
	it('is exactly the slot at p = 0, so the hand-off has no seam', () => {
		near(morphBox(slot, page, 0), slot);
	});

	it('is exactly the opened page at p = 1', () => {
		near(morphBox(slot, page, 1), page);
	});

	it('moves the centre in a straight line', () => {
		const half = morphBox(slot, page, 0.5);
		const cx = (b: Box) => b.left + b.width / 2;
		const cy = (b: Box) => b.top + b.height / 2;
		expect(cx(half)).toBeCloseTo((cx(slot) + cx(page)) / 2, 1);
		expect(cy(half)).toBeCloseTo((cy(slot) + cy(page)) / 2, 1);
	});

	it('grows by a constant RATIO, not a constant number of pixels', () => {
		// The point of the geometric interpolation: each quarter of the journey is
		// the same proportional change, so the eye reads an even growth. A linear
		// size would put the halfway width at (171 + 349) / 2 = 260 instead.
		const w = (p: number) => morphBox(slot, page, p).width;
		const step = w(0.5) / w(0.25);
		expect(w(0.25) / w(0)).toBeCloseTo(step, 3);
		expect(w(0.75) / w(0.5)).toBeCloseTo(step, 3);
		expect(w(1) / w(0.75)).toBeCloseTo(step, 3);
		expect(w(0.5)).toBeCloseTo(Math.sqrt(slot.width * page.width), 1);
	});

	it('keeps the A4 ratio the whole way', () => {
		for (const p of [0, 0.3, 0.6, 1]) {
			const b = morphBox(slot, page, p);
			expect(b.height / b.width).toBeCloseTo(A4, 6);
		}
	});
});

describe('morphProgress', () => {
	it('inverts the width the box put on screen', () => {
		for (const p of [0, 0.17, 0.5, 0.83, 1]) {
			expect(morphProgress(morphBox(slot, page, p).width, slot, page)).toBeCloseTo(p, 6);
		}
	});

	it('answers "arrived" for a degenerate width or journey', () => {
		expect(morphProgress(0, slot, page)).toBe(1);
		expect(morphProgress(NaN, slot, page)).toBe(1);
		expect(morphProgress(200, slot, slot)).toBe(1);
	});

	it('clamps outside the journey', () => {
		expect(morphProgress(page.width * 2, slot, page)).toBe(1);
		expect(morphProgress(slot.width / 2, slot, page)).toBe(0);
	});
});
