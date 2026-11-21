import { describe, expect, it } from 'vitest';
import {
	FLOOR_WEIGHT,
	HALF_LIFE_DAYS,
	dateWeight,
	dateWeightedOrder,
	daysFromToday,
	weightedShuffled
} from './browseOrder.ts';

// Local noon, so the reader's calendar day is unambiguous in any time zone.
const today = new Date(2026, 10, 21, 12); // November 21, 2026

/** A small deterministic generator, so the statistical checks never flake. */
function seeded(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
	};
}

describe('daysFromToday', () => {
	it('counts whole days either side of an exact date', () => {
		expect(daysFromToday('2026-11-21', today)).toBe(0);
		expect(daysFromToday('2026-11-20', today)).toBe(1);
		expect(daysFromToday('2026-12-01', today)).toBe(10);
		expect(daysFromToday('2025-11-21', today)).toBe(365);
	});

	it('treats a partial date as the span it names', () => {
		expect(daysFromToday('2026', today)).toBe(0);
		expect(daysFromToday('2026-11', today)).toBe(0);
		// From the end of October, not a false October 1st.
		expect(daysFromToday('2026-10', today)).toBe(21);
		// From December 31st, 2025.
		expect(daysFromToday('2025', today)).toBe(325);
		// From the start of a future month.
		expect(daysFromToday('2027-01', today)).toBe(41);
	});

	it('is null for anything that is not a date', () => {
		expect(daysFromToday('undated', today)).toBeNull();
		expect(daysFromToday('2026-13', today)).toBeNull();
	});
});

describe('dateWeight', () => {
	it('is 1 for today and halves its lead over the floor each half-life', () => {
		expect(dateWeight('2026-11-21', today)).toBe(1);
		const yearAgo = dateWeight('2025-11-21', today);
		expect(HALF_LIFE_DAYS).toBe(365);
		expect(yearAgo).toBeCloseTo(FLOOR_WEIGHT + (1 - FLOOR_WEIGHT) / 2);
	});

	it('never drops below the floor, which undated items take', () => {
		expect(dateWeight('1900', today)).toBeGreaterThanOrEqual(FLOOR_WEIGHT);
		expect(dateWeight('1900', today)).toBeCloseTo(FLOOR_WEIGHT);
		expect(dateWeight(null, today)).toBe(FLOOR_WEIGHT);
		expect(dateWeight('not a date', today)).toBe(FLOOR_WEIGHT);
	});
});

describe('weightedShuffled', () => {
	it('returns a new permutation of the same items', () => {
		const items = [1, 2, 3, 4, 5, 6, 7, 8];
		const out = weightedShuffled(items, () => 1, seeded(1));
		expect(out).not.toBe(items);
		expect([...out].sort((a, b) => a - b)).toEqual(items);
		expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
	});

	it('puts an item first in proportion to its weight', () => {
		// Weights 1 : 3, so the heavy item should lead about 3 times in 4.
		const random = seeded(42);
		let heavyFirst = 0;
		const runs = 20_000;
		for (let i = 0; i < runs; i++) {
			if (
				weightedShuffled(['light', 'heavy'], (x) => (x === 'heavy' ? 3 : 1), random)[0] === 'heavy'
			)
				heavyFirst++;
		}
		expect(heavyFirst / runs).toBeCloseTo(0.75, 1);
	});
});

describe('dateWeightedOrder', () => {
	it('leans toward recent items but still deals old and undated ones first', () => {
		const items = [
			{ id: 'now', date: '2026-11-20' },
			{ id: 'old', date: '1995' },
			{ id: 'undated', date: null }
		];
		const random = seeded(7);
		const firsts: Record<string, number> = { now: 0, old: 0, undated: 0 };
		for (let i = 0; i < 10_000; i++) {
			firsts[dateWeightedOrder(items, (x) => x.date, today, random)[0].id]++;
		}
		expect(firsts.now).toBeGreaterThan(firsts.old * 5);
		expect(firsts.now).toBeGreaterThan(firsts.undated * 5);
		expect(firsts.old).toBeGreaterThan(0);
		expect(firsts.undated).toBeGreaterThan(0);
	});
});
