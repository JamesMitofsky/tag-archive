import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ImageUploader from './ImageUploader.svelte';
import { sniffImageType } from '$lib/imageType';
import { bytesOf, canvasPhoto, dimensionsOf, fakeImageServer } from '$lib/testing/images';
import { simulateWebKitCanvas } from '$lib/testing/scanner';

// The iPhone path: WebKit canvases can't encode WebP and silently return PNG.
// Its own file so the once-per-page encode-type probe only ever sees a WebKit
// canvas, whichever test triggers it first. The WebP encoder here is the real
// libwebp WebAssembly build.

let canvas: ReturnType<typeof simulateWebKitCanvas>;

beforeEach(() => {
	canvas = simulateWebKitCanvas();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('ImageUploader.svelte without a WebP encoder (WebKit)', () => {
	it('still uploads a WebP display copy, never asking the canvas for one', async () => {
		const server = fakeImageServer();
		const onChange = vi.fn();
		render(ImageUploader, { onChange });
		const photo = await canvasPhoto('IMG_0042.PNG', { width: 3000, height: 2000 });

		await page.getByLabelText('Add photographs').upload(photo);
		// A 3000×2000 decode and a WebAssembly encode: slower than the native path.
		await vi.waitFor(() => expect(onChange).toHaveBeenCalledOnce(), { timeout: 10_000 });
		expect(onChange).toHaveBeenLastCalledWith([server.idOf('IMG_0042.PNG')]);

		const { original, display } = server.putsOf('IMG_0042.PNG');
		expect(await bytesOf(original!.body)).toEqual(await bytesOf(photo));
		expect(display!.headers).toEqual({ 'Content-Type': 'image/webp' });
		expect(sniffImageType(await bytesOf(display!.body))).toBe('image/webp');
		expect(await dimensionsOf(display!.body)).toEqual({ width: 2560, height: 1707 });
		expect(server.displays[0].size).toBe(display!.body.size);

		const requested = canvas.toBlob.mock.calls.map(([, type]) => type);
		expect(requested).not.toContain('image/webp');
	});
});
