import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sniffImageType } from '$lib/imageType';
import { MAX_DIM, downscale, releaseCanvas } from '$lib/scanner/image';
import { bytesOf, dimensionsOf } from '$lib/testing/images';
import { paintedCanvas, simulateWebKitCanvas } from '$lib/testing/scanner';
import { encodeWebP, UNENCODABLE_PHOTO } from './encode';

// The iPhone path: WebKit canvases can't encode WebP and silently return PNG.
// Its own file so the once-per-page encode-type probe only ever sees a WebKit
// canvas. The encoder here is the real libwebp WebAssembly build.

let canvas: ReturnType<typeof simulateWebKitCanvas>;

beforeEach(() => {
	canvas = simulateWebKitCanvas();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('encodeWebP without a WebP encoder (WebKit)', () => {
	it('encodes WebP with libwebp, never asking the canvas for it', async () => {
		const source = paintedCanvas(640, 480);
		const webp = await encodeWebP(source);

		expect(webp.type).toBe('image/webp');
		expect(sniffImageType(await bytesOf(webp))).toBe('image/webp');
		expect(await dimensionsOf(webp)).toEqual({ width: 640, height: 480 });
		const types = canvas.toBlob.mock.calls.map(([, type]) => type);
		expect(types).not.toContain('image/webp');
	});

	it('maps the canvas quality scale onto libwebp’s', async () => {
		const source = paintedCanvas(640, 480);
		// Noise, so quality makes a visible difference to the size.
		const ctx = source.getContext('2d')!;
		const noise = ctx.createImageData(640, 480);
		for (let i = 0; i < noise.data.length; i++) noise.data[i] = (i * 2654435761) >>> 24;
		ctx.putImageData(noise, 0, 0);

		const low = await encodeWebP(source, 0.1);
		const high = await encodeWebP(source, 0.95);
		expect(high.size).toBeGreaterThan(low.size);
		// Not a number at all: the default, rather than NaN handed to libwebp.
		expect(sniffImageType(await bytesOf(await encodeWebP(source, Number.NaN)))).toBe('image/webp');
	});

	it('encodes what downscaling leaves of a panorama sliver', async () => {
		const sliver = downscale(paintedCanvas(10000, 1), 10000, 1)!;
		expect(await dimensionsOf(await encodeWebP(sliver))).toEqual({ width: MAX_DIM, height: 1 });
	});

	it('says so, rather than failing deep inside, when there are no pixels to encode', async () => {
		const released = paintedCanvas(16, 16);
		releaseCanvas(released);
		await expect(encodeWebP(released)).rejects.toThrow(UNENCODABLE_PHOTO);
	});
});
