import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_DIM, encodedExtension, encodedImageType, encodeImage } from './image';
import { paintedCanvas, simulateWebKitCanvas } from '$lib/testing/scanner';

// Every test here runs against a WebKit-style canvas, so the once-per-page
// encode-type probe sees no WebP support whichever test triggers it first.

let canvas: ReturnType<typeof simulateWebKitCanvas>;

beforeEach(() => {
	canvas = simulateWebKitCanvas();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('encode format without a WebP encoder (WebKit)', () => {
	it('falls back to JPEG', async () => {
		expect(encodedImageType()).toBe('image/jpeg');
		expect(encodedExtension()).toBe('jpg');

		const blob = await encodeImage(paintedCanvas());
		expect(blob?.type).toBe('image/jpeg');
	});

	it('never asks for WebP, so no full-size PNG is encoded and thrown away', async () => {
		await encodeImage(paintedCanvas());

		expect(canvas.toBlob).toHaveBeenCalledTimes(1);
		expect(canvas.toBlob).not.toHaveBeenCalledWith(
			expect.anything(),
			'image/webp',
			expect.anything()
		);
	});

	it('keeps the requested quality', async () => {
		await encodeImage(paintedCanvas(), MAX_DIM, 0.6);

		expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.6);
	});
});
