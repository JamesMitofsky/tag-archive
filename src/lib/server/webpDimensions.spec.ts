import { describe, expect, it } from 'vitest';
import { webpDimensions } from './webpDimensions';

// Hand-built headers: the RIFF/WEBP preamble, one chunk header, and just
// enough of the chunk's payload for the dimensions.
function webp(fourcc: string, payload: number[]): Uint8Array {
	const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
	const body = [...ascii(fourcc), ...le32(payload.length), ...payload];
	return new Uint8Array([...ascii('RIFF'), ...le32(4 + body.length), ...ascii('WEBP'), ...body]);
}
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];

describe('webpDimensions', () => {
	it('reads a lossy (VP8) key frame', () => {
		// Frame tag (key frame), start code, then 14-bit width/height with 2 scale bits each.
		const width = 2560;
		const height = 1707 | (1 << 14); // a set scale bit must be masked off
		const header = [
			0x10,
			0x02,
			0x00,
			0x9d,
			0x01,
			0x2a,
			...le24(width).slice(0, 2),
			...le24(height).slice(0, 2)
		];
		expect(webpDimensions(webp('VP8 ', [...header, 0, 0]))).toEqual({ width: 2560, height: 1707 });
	});

	it('refuses a VP8 chunk that is not a key frame or lacks the start code', () => {
		const interframe = [0x11, 0x02, 0x00, 0x9d, 0x01, 0x2a, 0x10, 0x00, 0x10, 0x00, 0, 0];
		expect(webpDimensions(webp('VP8 ', interframe))).toBeNull();
		const noStart = [0x10, 0x02, 0x00, 0x00, 0x01, 0x2a, 0x10, 0x00, 0x10, 0x00, 0, 0];
		expect(webpDimensions(webp('VP8 ', noStart))).toBeNull();
	});

	it('reads a lossless (VP8L) header', () => {
		const bits = (1919 & 0x3fff) | ((1079 & 0x3fff) << 14);
		expect(webpDimensions(webp('VP8L', [0x2f, ...le32(bits), 0, 0, 0, 0, 0]))).toEqual({
			width: 1920,
			height: 1080
		});
		expect(webpDimensions(webp('VP8L', [0x00, ...le32(bits), 0, 0, 0, 0, 0]))).toBeNull();
	});

	it('reads an extended (VP8X) canvas', () => {
		const payload = [0x10, 0, 0, 0, ...le24(2559), ...le24(1439)];
		expect(webpDimensions(webp('VP8X', payload))).toEqual({ width: 2560, height: 1440 });
	});

	it('reads the canonical 1×1 encoder outputs of each layout', () => {
		// The tiny lossy, lossless and alpha (extended) WebPs browsers use to probe support.
		const decode = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		for (const base64 of [
			'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
			'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
			'UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA=='
		]) {
			expect(webpDimensions(decode(base64))).toEqual({ width: 1, height: 1 });
		}
	});

	it('refuses anything else', () => {
		expect(webpDimensions(new Uint8Array(40))).toBeNull();
		expect(webpDimensions(webp('ALPH', new Array(12).fill(0)))).toBeNull();
		expect(webpDimensions(webp('VP8X', [0, 0]).subarray(0, 24))).toBeNull();
	});
});
