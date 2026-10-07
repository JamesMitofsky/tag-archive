import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PageScanner from './PageScanner.svelte';
import {
	fakeCamera,
	fakeServer,
	pickedPhoto,
	shootAndCrop,
	simulateWebKitCanvas
} from '$lib/testing/scanner';

// The iPhone path: WebKit canvases can't encode WebP and silently return PNG.
// Its own file so the once-per-page encode-type probe only ever sees a WebKit
// canvas, whichever test triggers it first.

let canvas: ReturnType<typeof simulateWebKitCanvas>;

beforeEach(() => {
	canvas = simulateWebKitCanvas();
});

afterEach(() => {
	vi.restoreAllMocks();
});

/** The types every canvas encode so far asked for. */
const requestedTypes = () => canvas.toBlob.mock.calls.map(([, type]) => type);

describe('PageScanner.svelte without a WebP encoder (WebKit)', () => {
	it('uploads a picked photo as JPEG, named to match', async () => {
		const server = fakeServer();
		render(PageScanner, {});
		await page.getByLabelText('Add from photos').upload(await pickedPhoto('IMG_0042.PNG'));

		await vi.waitFor(() => expect(server.uploads).toHaveLength(1));
		expect(server.uploads[0].type).toBe('image/jpeg');
		expect(server.uploads[0].name).toBe('IMG_0042.jpg');
	});

	it('uploads a camera page as JPEG, and keeps its original as JPEG too', async () => {
		fakeCamera();
		const server = fakeServer();
		render(PageScanner, {});
		await shootAndCrop(1);
		await page.getByRole('button', { name: 'Add 1 page' }).click();

		await vi.waitFor(() => expect(server.uploads).toHaveLength(1));
		expect(server.uploads[0].type).toBe('image/jpeg');
		expect(server.uploads[0].name).toMatch(/^scan-[\d-]+\.jpg$/);
		// The kept original and the upload alike: never a WebP request that
		// WebKit would quietly turn into a full-size PNG.
		expect(requestedTypes()).not.toContain('image/webp');
		expect(requestedTypes()).toContain('image/jpeg');
	});

	it('renames a re-crop for its new format, whatever the server called the last one', async () => {
		fakeCamera();
		const server = fakeServer();
		const onChange = vi.fn();
		render(PageScanner, { onChange });
		await shootAndCrop(1);
		await page.getByRole('button', { name: 'Add 1 page' }).click();
		await vi.waitFor(() =>
			expect(onChange).toHaveBeenLastCalledWith(['https://example.com/new-1.webp'])
		);

		// The page now carries the server's name for it, `new-1.webp`.
		await page.getByRole('button', { name: 'Adjust crop of page 1' }).click();
		await page.getByRole('button', { name: 'Use whole image' }).click();
		await page.getByRole('button', { name: 'Apply crop' }).click();

		await vi.waitFor(() => expect(server.uploads).toHaveLength(2));
		expect(server.uploads[1].type).toBe('image/jpeg');
		expect(server.uploads[1].name).toBe('new-1.jpg');
	});

	it('previews the encoded upload itself rather than encoding a second copy', async () => {
		const createObjectURL = vi.spyOn(URL, 'createObjectURL');
		const server = fakeServer();
		render(PageScanner, {});
		await page.getByLabelText('Add from photos').upload(await pickedPhoto('IMG_0042.PNG'));
		await vi.waitFor(() => expect(server.uploads).toHaveLength(1));
		const [file] = server.uploads;

		// FormData wraps the upload in a new File, so match the encoded blob by content.
		const preview = createObjectURL.mock.calls.findIndex(
			([blob]) => blob instanceof Blob && blob.type === file.type && blob.size === file.size
		);
		expect(preview).toBeGreaterThanOrEqual(0);
		await expect
			.element(page.getByRole('img', { name: 'Page 1' }))
			.toHaveAttribute('src', createObjectURL.mock.results[preview].value);
		// Nothing bigger than the 1×1 support probe goes through toDataURL.
		const dataUrlCanvases = canvas.toDataURL.mock.contexts as HTMLCanvasElement[];
		expect(dataUrlCanvases.filter((c) => c.width > 1 || c.height > 1)).toEqual([]);
	});
});
