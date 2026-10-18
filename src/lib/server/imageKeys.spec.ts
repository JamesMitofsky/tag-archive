import { describe, expect, it } from 'vitest';
import { imageKeys, parseImageKeys, parseOriginalKey } from './imageKeys';

const UUID = '0b6f8d2e-3c4a-4f1e-9a7b-5d2c1e0f9a8b';
const DRAFT = 'AbCdEfGhIjKlMnOpQrStUv';

describe('imageKeys', () => {
	it('puts both objects in one folder per image', () => {
		expect(imageKeys('', 'image/heic', UUID)).toEqual({
			originalKey: `images/${UUID}/original.heic`,
			displayKey: `images/${UUID}/display.webp`
		});
		expect(imageKeys(`submissions/${DRAFT}/`, 'image/jpeg', UUID)).toEqual({
			originalKey: `submissions/${DRAFT}/images/${UUID}/original.jpg`,
			displayKey: `submissions/${DRAFT}/images/${UUID}/display.webp`
		});
	});

	it('never collides when the original is itself a WebP', () => {
		const { originalKey, displayKey } = imageKeys('', 'image/webp', UUID);
		expect(originalKey).not.toBe(displayKey);
	});

	it('draws a fresh folder each time', () => {
		expect(imageKeys('', 'image/png').originalKey).not.toBe(imageKeys('', 'image/png').originalKey);
	});
});

describe('parseImageKeys', () => {
	it('round-trips what imageKeys issues, prefix and type included', () => {
		for (const prefix of ['', `submissions/${DRAFT}/`]) {
			const keys = imageKeys(prefix, 'image/jpeg', UUID);
			expect(parseImageKeys(keys)).toEqual({
				...keys,
				prefix,
				uuid: UUID,
				originalType: 'image/jpeg'
			});
		}
	});

	it('refuses a display key outside the original’s own folder', () => {
		const mine = imageKeys('', 'image/png', UUID);
		const other = imageKeys('', 'image/png');
		expect(
			parseImageKeys({ originalKey: mine.originalKey, displayKey: other.displayKey })
		).toBeNull();
		expect(
			parseImageKeys({ originalKey: mine.originalKey, displayKey: mine.originalKey })
		).toBeNull();
	});

	it.each([
		`images/${UUID}/original.svg`,
		`images/${UUID}/original.JPG`,
		`images/${UUID.toUpperCase()}/original.jpg`,
		`images/not-a-uuid/original.jpg`,
		`images/${UUID}/../original.jpg`,
		`/images/${UUID}/original.jpg`,
		`submissions/short/images/${UUID}/original.jpg`,
		`submissions/${DRAFT}/x/images/${UUID}/original.jpg`,
		`other/images/${UUID}/original.jpg`,
		`images/${UUID}/original.jpg?x=1`,
		`${UUID}.webp`
	])('refuses %s', (originalKey) => {
		const displayKey = originalKey.replace(/original\.\w+.*$/, 'display.webp');
		expect(parseImageKeys({ originalKey, displayKey })).toBeNull();
	});

	it('refuses non-strings', () => {
		expect(parseImageKeys({ originalKey: 1, displayKey: null })).toBeNull();
	});
});

describe('parseOriginalKey', () => {
	it('implies the display sibling', () => {
		expect(parseOriginalKey(`images/${UUID}/original.gif`)?.displayKey).toBe(
			`images/${UUID}/display.webp`
		);
		expect(parseOriginalKey(`images/${UUID}/display.webp`)).toBeNull();
	});
});
