import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodedExtension, encodedImageType, encodeImage, withExtension } from './image';
import { paintedCanvas } from '$lib/testing/scanner';

// Chromium can encode WebP. The WebKit fallback is covered in
// image.webkit.svelte.spec.ts: the encode type is probed once per page load, so
// each canvas flavour needs its own test file (and so its own page).

afterEach(() => {
	vi.restoreAllMocks();
});

describe('encode format', () => {
	it('encodes WebP where the canvas supports it', async () => {
		expect(encodedImageType()).toBe('image/webp');
		expect(encodedExtension()).toBe('webp');

		const blob = await encodeImage(paintedCanvas());
		expect(blob?.type).toBe('image/webp');
	});

	it('probes support once, not on every encode', async () => {
		encodedImageType();
		const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');

		await encodeImage(paintedCanvas());
		await encodeImage(paintedCanvas());

		expect(toDataURL).not.toHaveBeenCalled();
	});

	it('caps the longest edge before encoding', async () => {
		const blob = await encodeImage(paintedCanvas(400, 100), 200);
		const bitmap = await createImageBitmap(blob!);
		expect([bitmap.width, bitmap.height]).toEqual([200, 50]);
		bitmap.close();
	});

	it('leaves a canvas within the cap at full size', async () => {
		const blob = await encodeImage(paintedCanvas(300, 120));
		const bitmap = await createImageBitmap(blob!);
		expect([bitmap.width, bitmap.height]).toEqual([300, 120]);
		bitmap.close();
	});
});

describe('withExtension', () => {
	it('names a file after the format it was actually encoded as', () => {
		expect(withExtension('scan-2026-10-06-12-00-00', 'image/jpeg')).toBe(
			'scan-2026-10-06-12-00-00.jpg'
		);
		expect(withExtension('IMG_0042.HEIC', 'image/webp')).toBe('IMG_0042.webp');
		expect(withExtension('scan.webp', 'image/jpeg')).toBe('scan.jpg');
		expect(withExtension('scan.webp', 'image/png')).toBe('scan.png');
	});

	it('leaves the name alone for a type it has no extension for', () => {
		expect(withExtension('scan.webp', 'application/octet-stream')).toBe('scan.webp');
	});
});
