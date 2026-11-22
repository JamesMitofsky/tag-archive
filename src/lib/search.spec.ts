import { describe, it, expect, vi } from 'vitest';
import type { EventItem } from '#lib/events.ts';
import type { PublicImage, PublicImageSet } from '#lib/images/types.ts';
import { imageCards, type ImageCard } from '#lib/images/cards.ts';
import { filterAndSortEvents, filterImageSets, searchImageCards } from './search';

function photo(id: number): PublicImage {
	return {
		id,
		url: `https://example.test/images/${id}/display.webp`,
		width: 4,
		height: 3,
		placeholder: null,
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

describe('filterAndSortEvents', () => {
	const TEMPERANCE = 'Temperance Alley Beautification';
	const ev = (id: number, title: string, date: string | null): EventItem => ({
		id,
		title,
		date,
		time: null,
		location: null,
		description: null,
		hosts: [],
		url: null
	});
	const events = [
		ev(1, TEMPERANCE, '2021-04-17'),
		ev(2, TEMPERANCE, '2021-04-24'),
		ev(3, TEMPERANCE, '2021-05-01'),
		ev(4, TEMPERANCE, '2021-05-08'),
		// An exact repeat of the 2021-05-01 row: the same choice to anyone picking.
		ev(5, TEMPERANCE, '2021-05-01'),
		ev(6, 'Morning Meditation', '2021-06-16')
	];

	it('lists every dated occurrence of a recurring title, each with its own id', () => {
		expect(filterAndSortEvents(events, 'temperance')).toEqual([
			{ id: 1, name: TEMPERANCE, date: '2021-04-17' },
			{ id: 2, name: TEMPERANCE, date: '2021-04-24' },
			{ id: 3, name: TEMPERANCE, date: '2021-05-01' },
			{ id: 4, name: TEMPERANCE, date: '2021-05-08' }
		]);
	});

	it('collapses only exact repeats of a title and date', () => {
		const may1 = filterAndSortEvents(events, '').filter((o) => o.date === '2021-05-01');
		expect(may1).toEqual([{ id: 3, name: TEMPERANCE, date: '2021-05-01' }]);
		// Undated rows of one title are repeats of each other too.
		expect(
			filterAndSortEvents([ev(7, 'Open house', null), ev(8, 'Open house', null)], 'open')
		).toEqual([{ id: 7, name: 'Open house', date: null }]);
	});

	it('orders the occurrences by nearness to the form date', () => {
		const ids = filterAndSortEvents(events, TEMPERANCE, '2021-05-02').map((o) => o.id);
		expect(ids).toEqual([3, 4, 2, 1]);
		// A vague date ranks from the first day it covers.
		expect(filterAndSortEvents(events, TEMPERANCE, '2021-05')[0]).toMatchObject({ id: 3 });
	});

	it('keeps the nearest of an exact repeat when sorting', () => {
		const repeat = [ev(9, 'Gala', '2020-01-01'), ev(10, 'Gala', '2020-01-01')];
		expect(filterAndSortEvents(repeat, 'gala', '2020-01-01')).toEqual([
			{ id: 9, name: 'Gala', date: '2020-01-01' }
		]);
	});
});

describe('searchImageCards', () => {
	const garden = set(1, { description: 'Garden flowers', images: [photo(11), photo(12)] });
	const mural = set(2, { description: 'The mural', images: [photo(21), photo(22)] });
	const cards = imageCards([garden, mural]);
	const signal = new AbortController().signal;
	const ids = (found: ImageCard[]) =>
		found.map((c) => `${c.kind}:${c.kind === 'set' ? c.id : c.photo.id}`);

	it('lists sets matched by their words first, as piles, then photographs by what they show', async () => {
		const found = await searchImageCards(
			cards,
			'flowers',
			async () => [
				{ id: 22, score: 0.4 },
				{ id: 11, score: 0.3 }
			],
			signal
		);
		// Photograph 11 is in both: its set says "flowers", and it shows them.
		expect(ids(found)).toEqual(['set:1', 'photo:22', 'photo:11']);
	});

	it('skips a match the dataset doesn’t hold', async () => {
		const found = await searchImageCards(
			cards,
			'zebra',
			async () => [{ id: 999, score: 0.5 }],
			signal
		);
		expect(found).toEqual([]);
	});

	it('falls back to the words alone when content search fails', async () => {
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
		const found = await searchImageCards(
			cards,
			'mural',
			async () => {
				throw new Error('502');
			},
			signal
		);
		expect(ids(found)).toEqual(['set:2']);
		quiet.mockRestore();
	});

	it('gives up on a search the reader has moved past', async () => {
		const controller = new AbortController();
		controller.abort();
		const aborted = new DOMException('Aborted', 'AbortError');
		await expect(
			searchImageCards(
				cards,
				'mural',
				async () => {
					throw aborted;
				},
				controller.signal
			)
		).rejects.toBe(aborted);
	});
});
