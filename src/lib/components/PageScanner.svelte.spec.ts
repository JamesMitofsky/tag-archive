import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PageScanner from './PageScanner.svelte';

const URLS = ['https://example.com/scan1.jpg', 'https://example.com/scan2.jpg'];

/** A real MediaStream with no permission prompt and no camera hardware. */
function fakeCamera() {
	const canvas = document.createElement('canvas');
	canvas.width = 640;
	canvas.height = 480;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#222';
	ctx.fillRect(0, 0, 640, 480);
	ctx.fillStyle = '#fff';
	ctx.fillRect(80, 60, 480, 360);
	const stream = canvas.captureStream(30);
	return vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(stream);
}

/**
 * The scans endpoint: every upload succeeds with its own URL, and the
 * uploaded images and deleted URLs are kept for the test to inspect.
 */
function fakeServer() {
	const uploads: Blob[] = [];
	const deleted: string[] = [];
	const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
		if (init?.method === 'DELETE') {
			deleted.push((JSON.parse(String(init.body)) as { url: string }).url);
			return new Response(null, { status: 204 });
		}
		uploads.push((init?.body as FormData).get('file') as Blob);
		const n = uploads.length;
		return new Response(
			JSON.stringify({ url: `https://example.com/new-${n}.webp`, fileName: `new-${n}.webp` }),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	});
	return { fetch, uploads, deleted };
}

async function widthOf(blob: Blob) {
	const bitmap = await createImageBitmap(blob);
	const { width } = bitmap;
	bitmap.close();
	return width;
}

/** Open the camera and wait until the shutter works. */
async function openCamera(name = 'Scan pages') {
	await page.getByRole('button', { name }).click();
	const shutter = page.getByRole('button', { name: /^(Capture|Retake) page$/ });
	await expect.element(shutter).not.toHaveAttribute('aria-disabled', 'true');
	return shutter;
}

/** Shoot `count` photos, then move on to cropping them. */
async function shootAndCrop(count: number) {
	const shutter = await openCamera();
	for (let i = 0; i < count; i++) await shutter.click();
	await page.getByRole('button', { name: /^Done, crop/ }).click();
	await expect.element(page.getByText(`Photo 1 of ${count}`)).toBeInTheDocument();
	// The photo has loaded once its corners can be reset, and the step is past
	// the moment it ignores taps carried over from the camera.
	await expect.element(page.getByRole('button', { name: 'Use whole image' })).toBeEnabled();
	await expect
		.element(page.getByRole('button', { name: /^(Next photo|Add \d|Replace page)/ }))
		.not.toHaveAttribute('aria-disabled', 'true');
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('PageScanner.svelte', () => {
	it('supports selecting multiple images without capture locking', async () => {
		render(PageScanner, {});

		const fileInput = page.getByLabelText('Add from photos');
		await expect.element(fileInput).toBeInTheDocument();

		// Check multi-image upload support
		const inputEl = document.querySelector('input[type="file"]') as HTMLInputElement | null;
		expect(inputEl).not.toBeNull();
		expect(inputEl?.hasAttribute('multiple')).toBe(true);
		expect(inputEl?.hasAttribute('capture')).toBe(false);
	});

	it('renders initial uploaded images', async () => {
		render(PageScanner, { initial: URLS });

		const images = page.getByRole('img', { name: 'Page 1' });
		await expect.element(images.first()).toBeInTheDocument();
	});

	it('numbers pages in order', async () => {
		render(PageScanner, { initial: URLS });

		await expect.element(page.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
		await expect.element(page.getByRole('img', { name: 'Page 2' })).toBeInTheDocument();
	});

	it('reorders pages and re-emits the new order', async () => {
		const onChange = vi.fn();
		render(PageScanner, { initial: URLS, onChange });

		await page.getByRole('button', { name: 'Move page 1 later' }).click();

		expect(onChange).toHaveBeenLastCalledWith([URLS[1], URLS[0]]);
	});

	it('disables the move buttons at each end of the strip', async () => {
		render(PageScanner, { initial: URLS });

		await expect.element(page.getByRole('button', { name: 'Move page 1 earlier' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Move page 2 later' })).toBeDisabled();
	});

	it('keeps the remaining order when a page is removed', async () => {
		const onChange = vi.fn();
		const three = [...URLS, 'https://example.com/scan3.jpg'];
		render(PageScanner, { initial: three, onChange });

		await page.getByRole('button', { name: 'Remove page 2' }).click();

		expect(onChange).toHaveBeenLastCalledWith([three[0], three[2]]);
	});

	it('offers no crop editor for pages that have no local original', async () => {
		render(PageScanner, { initial: URLS });

		// `initial` URLs come from the server, so there is nothing to re-crop.
		expect(document.querySelectorAll('[aria-label^="Adjust crop"]').length).toBe(0);
	});

	describe('camera run', () => {
		it('shows an X to quit until something is shot, then a check to finish', async () => {
			fakeCamera();
			render(PageScanner, {});
			const shutter = await openCamera();

			await expect.element(page.getByRole('button', { name: 'Close camera' })).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: /^Done/ })).not.toBeInTheDocument();

			await shutter.click();

			await expect
				.element(page.getByRole('button', { name: 'Done, crop 1 photo' }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'Close camera' }))
				.not.toBeInTheDocument();
		});

		it('quits without a trace when nothing was shot', async () => {
			fakeCamera();
			const server = fakeServer();
			render(PageScanner, {});
			await openCamera();

			await page.getByRole('button', { name: 'Close camera' }).click();

			await expect
				.element(page.getByRole('button', { name: 'Capture page' }))
				.not.toBeInTheDocument();
			expect(document.querySelectorAll('img[alt^="Page "]').length).toBe(0);
			expect(server.fetch).not.toHaveBeenCalled();
		});

		it('shows no crop guide while shooting', async () => {
			fakeCamera();
			render(PageScanner, {});
			const shutter = await openCamera();
			await shutter.click();

			const view = page.getByRole('dialog').element();
			expect(view.querySelector('canvas')).toBeNull();
			expect(view.textContent).not.toMatch(/edges/i);
		});

		it('keeps the camera open across captures, and uploads nothing yet', async () => {
			fakeCamera();
			const server = fakeServer();
			render(PageScanner, {});
			const shutter = await openCamera();

			await shutter.click();
			await shutter.click();

			// The regression this guards: capture used to tear the camera down.
			await expect.element(page.getByRole('button', { name: 'Capture page' })).toBeInTheDocument();
			await expect.element(page.getByText('2 photos')).toBeInTheDocument();
			expect(server.fetch).not.toHaveBeenCalled();
		});

		it('crops every photo after the run, and uploads only once cropping is done', async () => {
			fakeCamera();
			const server = fakeServer();
			const onChange = vi.fn();
			render(PageScanner, { onChange });
			await shootAndCrop(2);

			await page.getByRole('button', { name: 'Next photo' }).click();
			await expect.element(page.getByText('Photo 2 of 2')).toBeInTheDocument();
			expect(server.fetch).not.toHaveBeenCalled();

			await page.getByRole('button', { name: 'Add 2 pages' }).click();

			await expect.element(page.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
			await expect.element(page.getByRole('img', { name: 'Page 2' })).toBeInTheDocument();
			await vi.waitFor(() => expect(onChange.mock.lastCall?.[0]).toHaveLength(2));
			expect(new Set(onChange.mock.lastCall?.[0]).size).toBe(2);
		});

		it('uploads each page cropped as the crop step left it', async () => {
			fakeCamera();
			const server = fakeServer();
			render(PageScanner, {});
			await shootAndCrop(2);

			// Photo 1 keeps the whole frame; the correction must survive a round trip.
			await page.getByRole('button', { name: 'Use whole image' }).click();
			await page.getByRole('button', { name: 'Next photo' }).click();
			await expect.element(page.getByText('Photo 2 of 2')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Previous photo' }).click();
			await expect.element(page.getByText('Photo 1 of 2')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Next photo' }).click();
			await page.getByRole('button', { name: 'Add 2 pages' }).click();

			await vi.waitFor(() => expect(server.uploads).toHaveLength(2));
			// In page order: the 640px frame as shot, then the white page found in it.
			const [whole, cropped] = await Promise.all(server.uploads.map(widthOf));
			expect(whole).toBe(640);
			expect(cropped).toBeGreaterThan(400);
			expect(cropped).toBeLessThan(560);
		});

		it('adds every photo at once from the first with Add all', async () => {
			fakeCamera();
			const server = fakeServer();
			render(PageScanner, {});
			await shootAndCrop(3);

			await page.getByRole('button', { name: 'Add all 3' }).click();

			await expect.element(page.getByRole('img', { name: 'Page 3' })).toBeInTheDocument();
			await vi.waitFor(() => expect(server.uploads).toHaveLength(3));
		});

		it('goes back to the camera from the first photo and keeps what was shot', async () => {
			fakeCamera();
			render(PageScanner, {});
			await shootAndCrop(1);

			await page.getByRole('button', { name: 'Back to camera' }).click();

			const shutter = page.getByRole('button', { name: 'Capture page' });
			await expect.element(shutter).not.toHaveAttribute('aria-disabled', 'true');
			await expect.element(page.getByText('1 photo')).toBeInTheDocument();
			await shutter.click();
			await page.getByRole('button', { name: 'Done, crop 2 photos' }).click();
			await expect.element(page.getByText('Photo 1 of 2')).toBeInTheDocument();
		});

		it('discards a photo, and returns to the camera when none are left', async () => {
			fakeCamera();
			const server = fakeServer();
			render(PageScanner, {});
			await shootAndCrop(2);

			await page.getByRole('button', { name: 'Discard photo 1' }).click();
			await expect.element(page.getByText('Photo 1 of 1')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Discard photo 1' }).click();

			await expect.element(page.getByRole('button', { name: 'Close camera' })).toBeInTheDocument();
			expect(server.fetch).not.toHaveBeenCalled();
		});

		it('moves on with Enter on a corner without ever focusing Discard', async () => {
			fakeCamera();
			render(PageScanner, {});
			await shootAndCrop(2);

			const corner = document.querySelector<HTMLElement>('.scanic-handle')!;
			corner.focus();
			await userEvent.keyboard('{Enter}');
			// A second Enter straight away must not land on "Discard photo 2".
			await userEvent.keyboard('{Enter}');

			await expect.element(page.getByText('Photo 2 of 2')).toBeInTheDocument();
			await vi.waitFor(() =>
				expect(document.activeElement?.classList.contains('scanic-handle')).toBe(true)
			);
		});

		it('never drops photos on Escape: it moves on to cropping, then finishes', async () => {
			fakeCamera();
			const server = fakeServer();
			render(PageScanner, {});
			const shutter = await openCamera();
			await shutter.click();

			await userEvent.keyboard('{Escape}');
			await expect.element(page.getByText('Photo 1 of 1')).toBeInTheDocument();

			// On a corner, Escape only lets go of the corner.
			const corner = await vi.waitFor(() => {
				const handle = document.querySelector<HTMLElement>('.scanic-handle');
				expect(handle).not.toBeNull();
				return handle!;
			});
			corner.focus();
			expect(document.activeElement).toBe(corner);
			await userEvent.keyboard('{Escape}');
			await expect.element(page.getByText('Photo 1 of 1')).toBeInTheDocument();

			await userEvent.keyboard('{Escape}');
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			await expect.element(page.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
			await vi.waitFor(() => expect(server.uploads).toHaveLength(1));
		});

		it('deletes the upload of a page removed while it was uploading', async () => {
			fakeCamera();
			let finishUpload!: () => void;
			const uploadHeld = new Promise<void>((resolve) => (finishUpload = resolve));
			const deleted: string[] = [];
			vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
				if (init?.method === 'DELETE') {
					deleted.push((JSON.parse(String(init.body)) as { url: string }).url);
					return new Response(null, { status: 204 });
				}
				await uploadHeld;
				return new Response(
					JSON.stringify({ url: 'https://example.com/late.webp', fileName: 'late.webp' }),
					{ headers: { 'Content-Type': 'application/json' } }
				);
			});
			const onChange = vi.fn();
			render(PageScanner, { onChange });
			await shootAndCrop(1);
			await page.getByRole('button', { name: 'Add 1 page' }).click();
			await expect.element(page.getByText('Uploading...')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Remove page 1' }).click();
			finishUpload();

			await vi.waitFor(() => expect(deleted).toEqual(['https://example.com/late.webp']));
			expect(onChange).not.toHaveBeenCalledWith(['https://example.com/late.webp']);
		});

		it('retakes a page in place, through the crop step', async () => {
			fakeCamera();
			fakeServer();
			const onChange = vi.fn();
			render(PageScanner, { initial: URLS, onChange });

			const shutter = await openCamera('Retake page 1');
			await expect.element(page.getByText('Retaking page 1')).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Cancel retake' })).toBeInTheDocument();
			await shutter.click();

			await expect.element(page.getByText('New photo for page 1')).toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'Retake', exact: true }))
				.toBeInTheDocument();
			await page.getByRole('button', { name: 'Replace page 1' }).click();

			await vi.waitFor(() =>
				expect(onChange).toHaveBeenLastCalledWith(['https://example.com/new-1.webp', URLS[1]])
			);
		});

		it('keeps the page as it was when a retake is cancelled from the crop step', async () => {
			fakeCamera();
			const server = fakeServer();
			const onChange = vi.fn();
			render(PageScanner, { initial: URLS, onChange });

			const shutter = await openCamera('Retake page 2');
			await shutter.click();
			await expect.element(page.getByText('New photo for page 2')).toBeInTheDocument();

			// Escape there means the same as its X: cancel, not replace.
			await userEvent.keyboard('{Escape}');

			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			expect(server.fetch).not.toHaveBeenCalled();
			expect(onChange).not.toHaveBeenCalled();
			await expect
				.element(page.getByRole('img', { name: 'Page 2' }))
				.toHaveAttribute('src', URLS[1]);
		});

		it('re-crops a finished page from the page list', async () => {
			fakeCamera();
			const server = fakeServer();
			const onChange = vi.fn();
			render(PageScanner, { onChange });
			await shootAndCrop(1);
			await page.getByRole('button', { name: 'Add 1 page' }).click();
			await vi.waitFor(() =>
				expect(onChange).toHaveBeenLastCalledWith(['https://example.com/new-1.webp'])
			);

			await page.getByRole('button', { name: 'Adjust crop of page 1' }).click();
			await page.getByRole('button', { name: 'Use whole image' }).click();
			await page.getByRole('button', { name: 'Apply crop' }).click();

			await vi.waitFor(() =>
				expect(onChange).toHaveBeenLastCalledWith(['https://example.com/new-2.webp'])
			);
			expect(await widthOf(server.uploads[1])).toBe(640);
			// The first version is no longer referenced, so it is cleaned up.
			expect(server.deleted).toEqual(['https://example.com/new-1.webp']);
		});
	});
});
