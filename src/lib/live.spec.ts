import { describe, expect, it } from 'vitest';
import { arrivedAgo, newArrivals, type LiveArrival } from './live';

function arrival(id: number, arrivedAt: number): LiveArrival {
	return {
		id,
		artefact: `Artefact ${id}`,
		event: null,
		date: null,
		description: null,
		programArea: [],
		fileUrls: [],
		provenance: [],
		arrivedAt
	};
}

describe('newArrivals', () => {
	it('returns only ids never seen, oldest first, so a burst plays in order', () => {
		const feed = [arrival(9, 300), arrival(4, 200), arrival(7, 100), arrival(1, 50)];
		expect(newArrivals(new Set([1]), feed).map((a) => a.id)).toEqual([7, 4, 9]);
	});

	it('breaks a tie in arrival time by id', () => {
		const feed = [arrival(3, 100), arrival(2, 100)];
		expect(newArrivals(new Set(), feed).map((a) => a.id)).toEqual([2, 3]);
	});

	it('announces nothing when the feed holds only what was already seen', () => {
		expect(newArrivals(new Set([1, 2]), [arrival(2, 2), arrival(1, 1)])).toEqual([]);
	});

	it('does not reorder the feed it was given', () => {
		const feed = [arrival(2, 200), arrival(1, 100)];
		newArrivals(new Set(), feed);
		expect(feed.map((a) => a.id)).toEqual([2, 1]);
	});
});

describe('arrivedAgo', () => {
	const now = Date.UTC(2026, 10, 20, 12);
	const minute = 60 * 1000;

	it('reads under a minute, or a time ahead of this clock, as just now', () => {
		expect(arrivedAgo(now - 30 * 1000, now)).toBe('just now');
		expect(arrivedAgo(now + 2 * minute, now)).toBe('just now');
	});

	it('names the largest whole unit', () => {
		expect(arrivedAgo(now - 5 * minute, now)).toBe('5 minutes ago');
		expect(arrivedAgo(now - 90 * minute, now)).toBe('1 hour ago');
		expect(arrivedAgo(now - 3 * 60 * minute, now)).toBe('3 hours ago');
		expect(arrivedAgo(now - 30 * 60 * minute, now)).toBe('yesterday');
		expect(arrivedAgo(now - 10 * 24 * 60 * minute, now)).toBe('last week');
	});
});
