import { page } from 'vitest/browser';
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

	it('keeps the camera open across captures so pages can be scanned in a run', async () => {
		fakeCamera();
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ url: 'https://example.com/new.webp', fileName: 'new.webp' }), {
				headers: { 'Content-Type': 'application/json' }
			})
		);

		render(PageScanner, {});
		await page.getByRole('button', { name: 'Scan pages' }).click();

		const shutter = page.getByRole('button', { name: 'Capture page' });
		await expect.element(shutter).toBeEnabled();

		await shutter.click();
		await shutter.click();

		// The regression this guards: capture used to tear the camera down.
		await expect.element(page.getByRole('button', { name: 'Capture page' })).toBeInTheDocument();
		await expect.element(page.getByRole('img', { name: 'Page 2' })).toBeInTheDocument();
	});

	it('captures a page even when edge detection is unavailable', async () => {
		fakeCamera();
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ url: 'https://example.com/new.webp', fileName: 'new.webp' }), {
				headers: { 'Content-Type': 'application/json' }
			})
		);
		// Detection must only ever improve an upload, never block one.
		vi.doMock('scanic', () => {
			throw new Error('scanic unavailable');
		});

		render(PageScanner, {});
		await page.getByRole('button', { name: 'Scan pages' }).click();

		const shutter = page.getByRole('button', { name: 'Capture page' });
		await expect.element(shutter).toBeEnabled();
		await shutter.click();

		await expect.element(page.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
	});

	it('offers no crop editor for pages that have no local original', async () => {
		render(PageScanner, { initial: URLS });

		// `initial` URLs come from the server, so there is nothing to re-crop.
		expect(document.querySelectorAll('[aria-label^="Adjust crop"]').length).toBe(0);
	});
});
