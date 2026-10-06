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

/** Every upload succeeds, each with its own URL. */
function fakeUploads() {
	let count = 0;
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
		count += 1;
		return new Response(
			JSON.stringify({
				url: `https://example.com/new-${count}.webp`,
				fileName: `new-${count}.webp`
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	});
}

/** Open the camera and wait until the shutter works. */
async function openCamera(name = 'Scan pages') {
	await page.getByRole('button', { name }).click();
	const shutter = page.getByRole('button', { name: /^(Capture|Retake) page$/ });
	await expect.element(shutter).toBeEnabled();
	return shutter;
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
			await expect.element(page.getByRole('button', { name: 'Done' })).not.toBeInTheDocument();

			await shutter.click();

			await expect.element(page.getByRole('button', { name: 'Done' })).toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'Close camera' }))
				.not.toBeInTheDocument();
		});

		it('quits without a trace when nothing was shot', async () => {
			fakeCamera();
			const uploads = fakeUploads();
			render(PageScanner, {});
			await openCamera();

			await page.getByRole('button', { name: 'Close camera' }).click();

			await expect
				.element(page.getByRole('button', { name: 'Capture page' }))
				.not.toBeInTheDocument();
			expect(document.querySelectorAll('img[alt^="Page "]').length).toBe(0);
			expect(uploads).not.toHaveBeenCalled();
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

		it('keeps the camera open across captures so pages can be scanned in a run', async () => {
			fakeCamera();
			render(PageScanner, {});
			const shutter = await openCamera();

			await shutter.click();
			await shutter.click();

			// The regression this guards: capture used to tear the camera down.
			await expect.element(page.getByRole('button', { name: 'Capture page' })).toBeInTheDocument();
			await expect.element(page.getByText('2 pages')).toBeInTheDocument();
		});

		it('crops every page after the run, and uploads nothing until then', async () => {
			fakeCamera();
			const uploads = fakeUploads();
			const onChange = vi.fn();
			render(PageScanner, { onChange });
			const shutter = await openCamera();
			await shutter.click();
			await shutter.click();

			await page.getByRole('button', { name: 'Done' }).click();
			await expect.element(page.getByText('Page 1 of 2')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Next page' }).click();
			await expect.element(page.getByText('Page 2 of 2')).toBeInTheDocument();
			expect(uploads).not.toHaveBeenCalled();

			await page.getByRole('button', { name: 'Done' }).click();

			await expect.element(page.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
			await expect.element(page.getByRole('img', { name: 'Page 2' })).toBeInTheDocument();
			await vi.waitFor(() => expect(onChange.mock.lastCall?.[0]).toHaveLength(2));
			expect(new Set(onChange.mock.lastCall?.[0]).size).toBe(2);
		});

		it('goes back to the camera from the first page and keeps what was shot', async () => {
			fakeCamera();
			render(PageScanner, {});
			const shutter = await openCamera();
			await shutter.click();
			await page.getByRole('button', { name: 'Done' }).click();
			await expect.element(page.getByText('Page 1 of 1')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Back to camera' }).click();

			await expect.element(shutter).toBeEnabled();
			await expect.element(page.getByText('1 page')).toBeInTheDocument();
			await shutter.click();
			await page.getByRole('button', { name: 'Done' }).click();
			await expect.element(page.getByText('Page 1 of 2')).toBeInTheDocument();
		});

		it('discards a photo in the review, and returns to the camera when none are left', async () => {
			fakeCamera();
			const uploads = fakeUploads();
			render(PageScanner, {});
			const shutter = await openCamera();
			await shutter.click();
			await shutter.click();
			await page.getByRole('button', { name: 'Done' }).click();
			await expect.element(page.getByText('Page 1 of 2')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Discard page 1' }).click();
			await expect.element(page.getByText('Page 1 of 1')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Discard page 1' }).click();

			await expect.element(page.getByRole('button', { name: 'Close camera' })).toBeInTheDocument();
			expect(uploads).not.toHaveBeenCalled();
		});

		it('never drops photos on Escape: it moves on to cropping, then finishes', async () => {
			fakeCamera();
			const uploads = fakeUploads();
			render(PageScanner, {});
			const shutter = await openCamera();
			await shutter.click();

			await userEvent.keyboard('{Escape}');
			await expect.element(page.getByText('Page 1 of 1')).toBeInTheDocument();

			await userEvent.keyboard('{Escape}');
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			await expect.element(page.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
			await vi.waitFor(() => expect(uploads).toHaveBeenCalledTimes(1));
		});

		it('retakes a page in place, through the crop step', async () => {
			fakeCamera();
			fakeUploads();
			const onChange = vi.fn();
			render(PageScanner, { initial: URLS, onChange });

			const shutter = await openCamera('Retake page 1');
			await expect.element(page.getByRole('button', { name: 'Cancel retake' })).toBeInTheDocument();
			await shutter.click();

			await expect.element(page.getByText('Page 1 of 1')).toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'Retake', exact: true }))
				.toBeInTheDocument();
			await page.getByRole('button', { name: 'Done' }).click();

			await vi.waitFor(() =>
				expect(onChange).toHaveBeenLastCalledWith(['https://example.com/new-1.webp', URLS[1]])
			);
		});
	});
});
