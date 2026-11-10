import { describe, expect, it } from 'vitest';
import { sniffImageType } from './imageType';

const bytes = (...parts: (string | number[])[]) =>
	new Uint8Array(
		parts.flatMap((part) =>
			typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part
		)
	);
const pad = (b: Uint8Array) => {
	const out = new Uint8Array(Math.max(b.length, 32));
	out.set(b);
	return out;
};

describe('sniffImageType', () => {
	it('recognises each format the scanner sends, by its leading bytes', () => {
		expect(sniffImageType(pad(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')))).toBe('image/webp');
		expect(sniffImageType(pad(bytes([0xff, 0xd8, 0xff, 0xe0])))).toBe('image/jpeg');
		expect(sniffImageType(pad(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a])))).toBe('image/png');
		expect(sniffImageType(pad(bytes('GIF89a')))).toBe('image/gif');
		expect(sniffImageType(pad(bytes([0, 0, 0, 0x18], 'ftypheic')))).toBe('image/heic');
		expect(sniffImageType(pad(bytes([0, 0, 0, 0x18], 'ftypmif1')))).toBe('image/heic');
	});

	it('refuses SVG and HTML whatever type the client claims', () => {
		expect(sniffImageType(pad(bytes('<svg xmlns="http://www.w3.org/2000/svg">')))).toBeNull();
		expect(sniffImageType(pad(bytes('<!doctype html><script>')))).toBeNull();
	});

	it('refuses other ISO-BMFF files, such as MP4 video', () => {
		expect(sniffImageType(pad(bytes([0, 0, 0, 0x18], 'ftypisom')))).toBeNull();
	});

	it('refuses truncated input', () => {
		expect(sniffImageType(bytes([0xff, 0xd8]))).toBeNull();
	});
});
