import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	encodedExtension,
	encodedImageType,
	encodeImage,
	rotateCanvas,
	withExtension
} from './image';
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

describe('rotateCanvas', () => {
	/** The color at a pixel, as `#rrggbb`. */
	function colorAt(canvas: HTMLCanvasElement, x: number, y: number) {
		const [r, g, b] = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data;
		return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
	}

	/** 4×2, with each corner pixel its own color. */
	function marked() {
		const canvas = document.createElement('canvas');
		canvas.width = 4;
		canvas.height = 2;
		const ctx = canvas.getContext('2d')!;
		const mark = (color: string, x: number, y: number) => {
			ctx.fillStyle = color;
			ctx.fillRect(x, y, 1, 1);
		};
		mark('#ff0000', 0, 0);
		mark('#00ff00', 3, 0);
		mark('#0000ff', 3, 1);
		mark('#ffff00', 0, 1);
		return canvas;
	}

	it('turns a quarter counterclockwise: the top-right corner comes to the top-left', () => {
		const turned = rotateCanvas(marked(), 1)!;
		expect([turned.width, turned.height]).toEqual([2, 4]);
		expect(colorAt(turned, 0, 0)).toBe('#00ff00');
		expect(colorAt(turned, 1, 0)).toBe('#0000ff');
		expect(colorAt(turned, 1, 3)).toBe('#ffff00');
		expect(colorAt(turned, 0, 3)).toBe('#ff0000');
	});

	it('turns half way round', () => {
		const turned = rotateCanvas(marked(), 2)!;
		expect([turned.width, turned.height]).toEqual([4, 2]);
		expect(colorAt(turned, 0, 0)).toBe('#0000ff');
		expect(colorAt(turned, 3, 1)).toBe('#ff0000');
	});

	it('turns three quarters: the bottom-left corner comes to the top-left', () => {
		const turned = rotateCanvas(marked(), 3)!;
		expect([turned.width, turned.height]).toEqual([2, 4]);
		expect(colorAt(turned, 0, 0)).toBe('#ffff00');
		expect(colorAt(turned, 1, 0)).toBe('#ff0000');
	});

	it('hands back the canvas itself for a full turn', () => {
		const canvas = marked();
		expect(rotateCanvas(canvas, 0)).toBe(canvas);
		expect(rotateCanvas(canvas, 4)).toBe(canvas);
	});
});
