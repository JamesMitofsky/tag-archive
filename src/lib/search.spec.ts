import { describe, it, expect } from 'vitest';
import type { PublicImage, PublicImageSet } from '$lib/images/types';
import { filterImageSets } from './search';

function photo(id: number): PublicImage {
	return {
		id,
		url: `https://example.test/images/${id}/display.webp`,
		width: 4,
		height: 3,
		capturedDate: null
	};
}

function set(id: number, fields: Partial<Omit<PublicImageSet, 'id'>> = {}): PublicImageSet {
	return { id, description: null, event: null, date: null, images: [photo(id * 10)], ...fields };
}

/** Ids of the sets a query finds, so failures read as a list rather than a diff of objects. */
function found(rows: PublicImageSet[], q: string): number[] {
	return filterImageSets(rows, q).map((row) => row.id);
}

describe('filterImageSets', () => {
	const july = set(1, { date: '2024-07-12', description: 'Lanterns along the river' });
	const garden = set(2, {
		event: 'Garden Opening',
		date: '2023-05',
		description: 'First light\nThe beds before planting'
	});
	const undated = set(3, { images: [photo(31), photo(32), photo(33)] });
	const rows = [july, garden, undated];

	it('finds nothing for a blank query, like the other searches', () => {
		expect(found(rows, '')).toEqual([]);
		expect(found(rows, '   ')).toEqual([]);
	});

	it('finds a set by its date as stored and as read', () => {
		expect(found(rows, '2024-07')).toEqual([1]);
		expect(found(rows, '2024-07-12')).toEqual([1]);
		expect(found(rows, 'July 2024')).toEqual([1]);
		expect(found(rows, 'july 12, 2024')).toEqual([1]);
		// Day-first, the way it would be said aloud in much of the world.
		expect(found(rows, '12 July 2024')).toEqual([1]);
		// An abbreviated month is a prefix of the long name.
		expect(found(rows, 'Jul 2024')).toEqual([1]);
	});

	it('reads a partial date at the precision it carries', () => {
		expect(found(rows, 'May 2023')).toEqual([2]);
		expect(found(rows, '2023-05')).toEqual([2]);
		// Never widened to a made-up first of the month.
		expect(found(rows, '2023-05-01')).toEqual([]);
	});

	it('requires every word to appear somewhere on the set (AND across fields)', () => {
		expect(found(rows, 'garden 2023')).toEqual([2]);
		expect(found(rows, 'garden 2024')).toEqual([]);
		expect(found(rows, 'lanterns july')).toEqual([1]);
	});

	it('matches the event title and the whole description, ignoring case', () => {
		expect(found(rows, 'GARDEN opening')).toEqual([2]);
		// Past the first line, which only the label carries.
		expect(found(rows, 'planting')).toEqual([2]);
		expect(found(rows, 'river')).toEqual([1]);
	});

	it('finds a set with nothing else to go by under its count, the label it is shown under', () => {
		expect(found(rows, '3 photographs')).toEqual([3]);
		expect(found(rows, 'photographs')).toEqual([3]);
	});

	it("does not let a set's photograph count answer a date query", () => {
		// The garden set holds one photograph and is dated only to the month: a
		// count searched on every set would let its "1" pass for the day.
		expect(found(rows, 'May 1')).toEqual([]);
	});

	it('copes with an undated set that has neither event nor description', () => {
		expect(found([undated], '2024')).toEqual([]);
		expect(found([undated], 'undated')).toEqual([]);
	});

	it('keeps the input order and returns the rows themselves', () => {
		const result = filterImageSets([undated, july, garden], 'a');
		expect(result.map((row) => row.id)).toEqual([3, 1, 2]);
		expect(result[1]).toBe(july);
	});
});
