import { describe, expect, it } from 'vitest';
import type { PublicImage, PublicImageSet } from './types';
import { cardPhotos, imageCards, normalizeContentQuery, photoCardId } from './cards';

const photo = (id: number): PublicImage => ({
	id,
	url: `https://example.test/${id}.webp`,
	width: 4,
	height: 3,
	placeholder: null,
	capturedDate: null
});
const set = (id: number, photoIds: number[]): PublicImageSet => ({
	id,
	description: null,
	event: null,
	date: null,
	images: photoIds.map(photo)
});

describe('imageCards', () => {
	it('makes a card of every set and of every photograph, no two with one id', () => {
		// Set 1 and photograph 1 share an id in their own tables.
		const cards = imageCards([set(1, [1, 2]), set(2, [3])]);
		expect(cards.map((c) => [c.kind, c.id])).toEqual([
			['set', 1],
			['set', 2],
			['photo', -1],
			['photo', -2],
			['photo', -3]
		]);
		expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
		expect(photoCardId(3)).toBe(-3);
	});
});

describe('cardPhotos', () => {
	const [setCard, , middle] = imageCards([set(1, [1, 2, 3])]);

	it('opens a set in its own order', () => {
		expect(cardPhotos(setCard).map((p) => p.id)).toEqual([1, 2, 3]);
	});

	it('opens a loose photograph’s set with that photograph leading, the rest in order', () => {
		expect(cardPhotos(middle).map((p) => p.id)).toEqual([2, 1, 3]);
	});
});

describe('normalizeContentQuery', () => {
	it('trims, lowercases and collapses spaces', () => {
		expect(normalizeContentQuery('  Red   Flowers\t')).toBe('red flowers');
	});
});
