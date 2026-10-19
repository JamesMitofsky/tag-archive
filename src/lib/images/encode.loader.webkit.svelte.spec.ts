import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sniffImageType } from '$lib/imageType';
import { bytesOf } from '$lib/testing/images';
import { paintedCanvas, simulateWebKitCanvas } from '$lib/testing/scanner';
import { encodeWebP, UNENCODABLE_PHOTO } from './encode';

// libwebp's .wasm download failing, on the iPhone path. Its own file, so the
// encoder has never loaded on this page when the test starts: once loaded,
// it is kept for the page's life and never downloaded again.

beforeEach(() => {
	simulateWebKitCanvas();
});

afterEach(() => {
	vi.restoreAllMocks();
});

it('blames the connection when libwebp fails to download, and loads it for the next photo', async () => {
	// The connection drops once, mid-download of the encoder's .wasm.
	const { fetch } = globalThis;
	let dropped = 0;
	vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
		const url = new URL(input instanceof Request ? input.url : input, location.href);
		if (url.pathname.endsWith('.wasm') && dropped === 0) {
			dropped++;
			return Promise.reject(new TypeError('Load failed'));
		}
		return fetch(input, init);
	});

	const first = encodeWebP(paintedCanvas(64, 48));
	await expect(first).rejects.toThrow(
		'The WebP converter could not be loaded. Check your connection.'
	);
	await expect(first).rejects.not.toThrow(UNENCODABLE_PHOTO);
	expect(dropped).toBe(1);

	const second = await encodeWebP(paintedCanvas(64, 48));
	expect(sniffImageType(await bytesOf(second))).toBe('image/webp');
});
