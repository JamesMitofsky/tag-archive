import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	MAX_DIM,
	downscale,
	encodedExtension,
	encodedImageType,
	encodeImage,
	fitWithin,
	rotateQuarterTurns,
	withExtension
} from './image';
import { paintedCanvas } from '$lib/testing/scanner';

// Chromium can encode WebP. The WebKit fallback is covered in
// image.webkit.svelte.spec.ts: the encode type is probed once per page load, so
// each canvas flavor needs its own test file (and so its own page).

afterEach(() => {
	vi.restoreAllMocks();
});

describe('rotateQuarterTurns', () => {
	/** A 3×2 canvas whose top-left pixel alone is red, the rest blue. */
	function marked() {
		const canvas = document.createElement('canvas');
		canvas.width = 3;
		canvas.height = 2;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = '#00f';
		ctx.fillRect(0, 0, 3, 2);
		ctx.fillStyle = '#f00';
		ctx.fillRect(0, 0, 1, 1);
		return canvas;
	}

	/** Every pixel, as 'r' (red) or 'b' (blue), row by row. */
	function pixels(canvas: HTMLCanvasElement) {
		const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
		const rows: string[] = [];
		for (let y = 0; y < canvas.height; y++) {
			let row = '';
			for (let x = 0; x < canvas.width; x++)
				row += data[(y * canvas.width + x) * 4] > 127 ? 'r' : 'b';
			rows.push(row);
		}
		return rows;
	}

	it('turns counterclockwise, pixel for pixel', () => {
		// The top-left corner goes to the bottom-left.
		expect(pixels(rotateQuarterTurns(marked(), 1)!)).toEqual(['bb', 'bb', 'rb']);
		expect(pixels(rotateQuarterTurns(marked(), 2)!)).toEqual(['bbb', 'bbr']);
		expect(pixels(rotateQuarterTurns(marked(), 3)!)).toEqual(['br', 'bb', 'bb']);
		expect(pixels(rotateQuarterTurns(marked(), 4)!)).toEqual(['rbb', 'bbb']);
		expect(pixels(rotateQuarterTurns(marked(), -1)!)).toEqual(['br', 'bb', 'bb']);
	});
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

describe('fitWithin', () => {
	it('caps the longest edge, keeping the aspect ratio', () => {
		expect(fitWithin(4000, 3000, 2560)).toEqual({ width: 2560, height: 1920 });
		expect(fitWithin(3000, 4000, 2560)).toEqual({ width: 1920, height: 2560 });
		expect(fitWithin(300, 120, 2560)).toEqual({ width: 300, height: 120 });
	});

	it('never rounds the short edge of a sliver to nothing', () => {
		expect(fitWithin(10000, 1, 2560)).toEqual({ width: 2560, height: 1 });
		expect(fitWithin(1, 10000, 2560)).toEqual({ width: 1, height: 2560 });
	});
});

describe('downscale', () => {
	it('keeps a row of a panorama sliver, so there is something to encode', () => {
		const sliver = downscale(paintedCanvas(10000, 1), 10000, 1);
		expect([sliver?.width, sliver?.height]).toEqual([MAX_DIM, 1]);
	});

	it('draws with high-quality smoothing, so a large photo shrinks without aliasing', () => {
		// The default is 'low', which aliases at the ~3× a 48 MP photo shrinks by.
		const original = CanvasRenderingContext2D.prototype.drawImage;
		const qualities: ImageSmoothingQuality[] = [];
		vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage').mockImplementation(function (
			this: CanvasRenderingContext2D,
			...args: Parameters<CanvasRenderingContext2D['drawImage']>
		) {
			qualities.push(this.imageSmoothingQuality);
			return Reflect.apply(original, this, args);
		});

		downscale(paintedCanvas(7680, 64), 7680, 64);
		expect(qualities).toEqual(['high']);
	});
});
