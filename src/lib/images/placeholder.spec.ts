import { describe, expect, it } from 'vitest';
import { parsePlaceholder, placeholderFromRGBA, placeholderUrl } from './placeholder';

/** An opaque image with some variation in it, so the hash carries AC terms. */
function gradient(width: number, height: number, alpha = () => 255): Uint8ClampedArray {
	const rgba = new Uint8ClampedArray(width * height * 4);
	for (let y = 0, i = 0; y < height; y++) {
		for (let x = 0; x < width; x++, i += 4) {
			rgba[i] = (x * 255) / width;
			rgba[i + 1] = (y * 255) / height;
			rgba[i + 2] = 90;
			rgba[i + 3] = alpha();
		}
	}
	return rgba;
}

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

describe('placeholderFromRGBA', () => {
	it('makes a hash parsePlaceholder accepts, landscape and portrait', () => {
		for (const [w, h] of [
			[80, 60],
			[60, 80],
			[1, 1]
		]) {
			const hash = placeholderFromRGBA(gradient(w, h), w, h);
			expect(parsePlaceholder(hash)).toBe(hash);
		}
	});

	it('makes a well-formed hash of an image with transparent parts', () => {
		let n = 0;
		const hash = placeholderFromRGBA(
			gradient(40, 30, () => (n++ % 3 ? 255 : 0)),
			40,
			30
		);
		expect(parsePlaceholder(hash)).toBe(hash);
	});

	it('shrinks an image larger than ThumbHash takes, rather than throwing', () => {
		const hash = placeholderFromRGBA(gradient(2560, 1707), 2560, 1707);
		expect(parsePlaceholder(hash)).toBe(hash);
		// Averaging down keeps the picture: the same scene at another size hashes alike.
		expect(hash.slice(0, 4)).toBe(placeholderFromRGBA(gradient(96, 64), 96, 64).slice(0, 4));
	});
});

describe('parsePlaceholder', () => {
	const hash = placeholderFromRGBA(gradient(80, 60), 80, 60);
	const bytes = fromBase64(hash);

	it('refuses anything but a string of base64', () => {
		for (const value of [undefined, null, 42, {}, '', 'not base64!', 'abc', hash.slice(1)]) {
			expect(parsePlaceholder(value)).toBeNull();
		}
	});

	it('refuses a hash shorter or longer than its header says', () => {
		expect(parsePlaceholder(toBase64(bytes.slice(0, -1)))).toBeNull();
		expect(parsePlaceholder(toBase64(new Uint8Array([...bytes, 0])))).toBeNull();
		expect(parsePlaceholder(toBase64(bytes.slice(0, 4)))).toBeNull();
	});

	it('refuses something far too long to be a hash', () => {
		expect(parsePlaceholder('A'.repeat(200))).toBeNull();
	});
});

describe('placeholderUrl', () => {
	it('decodes a hash to a PNG data URL, the same one each time', () => {
		const hash = placeholderFromRGBA(gradient(80, 60), 80, 60);
		const url = placeholderUrl(hash);
		expect(url).toMatch(/^data:image\/png;base64,/);
		expect(placeholderUrl(hash)).toBe(url);
	});

	it('is null for no placeholder or a malformed one', () => {
		expect(placeholderUrl(null)).toBeNull();
		expect(placeholderUrl(undefined)).toBeNull();
		expect(placeholderUrl('')).toBeNull();
		expect(placeholderUrl('AAAA')).toBeNull();
	});
});
