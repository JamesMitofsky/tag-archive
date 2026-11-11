import { describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ BETTER_AUTH_SECRET: 'test-secret' }));
vi.mock('$env/dynamic/private', () => ({ env }));

const { imageKeys, parseImageKeys, parseOriginalKey } = await import('./imageKeys');
const { isPlainKey } = await import('./scans');

const UUID = '0b6f8d2e-3c4a-4f1e-9a7b-5d2c1e0f9a8b';
const DRAFT = 'AbCdEfGhIjKlMnOpQrStUv';
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The folder a key sits in, under `images/`. */
const folderOf = (key: string) => /images\/([^/]+)\//.exec(key)?.[1];

/** The display copy's folder for `UUID`'s original, under `secret`. */
function displayFolderUnder(secret: string) {
	const saved = env.BETTER_AUTH_SECRET;
	env.BETTER_AUTH_SECRET = secret;
	try {
		return folderOf(imageKeys('', 'image/jpeg', UUID).displayKey);
	} finally {
		env.BETTER_AUTH_SECRET = saved;
	}
}

describe('imageKeys', () => {
	it('lays the original out under its uuid, in the uploader’s space', () => {
		expect(imageKeys('', 'image/heic', UUID).originalKey).toBe(`images/${UUID}/original.heic`);
		expect(imageKeys(`submissions/${DRAFT}/`, 'image/jpeg', UUID).originalKey).toBe(
			`submissions/${DRAFT}/images/${UUID}/original.jpg`
		);
	});

	it('puts the display copy in a folder of its own, in the same space', () => {
		for (const prefix of ['', `submissions/${DRAFT}/`]) {
			const { originalKey, displayKey } = imageKeys(prefix, 'image/jpeg', UUID);
			const folder = folderOf(displayKey)!;
			expect(displayKey).toBe(`${prefix}images/${folder}/display.webp`);
			expect(folder).toMatch(UUID_SHAPE);
			expect(folder).not.toBe(folderOf(originalKey));
			expect(isPlainKey(displayKey)).toBe(true);
		}
	});

	it('keeps the original’s folder out of reach of anyone holding only the display URL', () => {
		// The display folder is a keyed hash of the original's: without the
		// server's secret it can't be recomputed, let alone turned back.
		expect(displayFolderUnder('test-secret')).toBe(
			folderOf(imageKeys('', 'image/jpeg', UUID).displayKey)
		);
		expect(displayFolderUnder('another-secret')).not.toBe(displayFolderUnder('test-secret'));
		expect(displayFolderUnder('test-secret')).not.toContain(UUID.slice(0, 8));
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

	it('refuses any display key but the one derived from the original', () => {
		const mine = imageKeys('', 'image/png', UUID);
		const other = imageKeys('', 'image/png');
		for (const displayKey of [
			other.displayKey,
			mine.originalKey,
			// The layout before display copies got their own folder.
			`images/${UUID}/display.webp`,
			`submissions/${DRAFT}/${mine.displayKey}`
		]) {
			expect(parseImageKeys({ originalKey: mine.originalKey, displayKey })).toBeNull();
		}
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
		// Paired with the display key its uuid would get, were it well formed.
		const displayKey = imageKeys('', 'image/jpeg', UUID).displayKey;
		expect(parseImageKeys({ originalKey, displayKey })).toBeNull();
	});

	it('refuses non-strings', () => {
		expect(parseImageKeys({ originalKey: 1, displayKey: null })).toBeNull();
	});
});

describe('parseOriginalKey', () => {
	it('derives the display key', () => {
		const keys = imageKeys(`submissions/${DRAFT}/`, 'image/gif', UUID);
		expect(parseOriginalKey(keys.originalKey)?.displayKey).toBe(keys.displayKey);
		expect(parseOriginalKey(keys.displayKey)).toBeNull();
		expect(parseOriginalKey(`images/${UUID}/display.webp`)).toBeNull();
	});
});
