import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PageScanner from './PageScanner.svelte';

// A file of its own: module mocks can't reach a module an earlier test in the
// same file already loaded. Every entry point throws, as a broken WASM build or
// an unsupported browser would; a factory that throws outright can't stand in
// for that, because browser-mode Vitest reports it as its own error.
vi.mock('scanic', () => {
	const unavailable = () => {
		throw new Error('scanic unavailable');
	};
	return {
		Scanner: class {
			constructor() {
				unavailable();
			}
		},
		createCornerEditor: unavailable,
		extractDocument: async () => unavailable()
	};
});

afterEach(() => {
	vi.restoreAllMocks();
});

it('still captures, crops and uploads when scanic is unavailable', async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 640;
	canvas.height = 480;
	canvas.getContext('2d')!.fillRect(0, 0, 640, 480);
	vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(canvas.captureStream(30));
	const uploads = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(JSON.stringify({ url: 'https://example.com/new.webp', fileName: 'new.webp' }), {
			headers: { 'Content-Type': 'application/json' }
		})
	);
	const onChange = vi.fn();

	render(PageScanner, { onChange });
	await page.getByRole('button', { name: 'Scan pages' }).click();
	const shutter = page.getByRole('button', { name: 'Capture page' });
	await expect.element(shutter).not.toHaveAttribute('aria-disabled', 'true');
	await shutter.click();
	await page.getByRole('button', { name: 'Done, crop 1 photo' }).click();

	// Detection and the crop editor only ever improve a page, never block one.
	await expect
		.element(page.getByText(/crop editor could not be loaded, so the page will be kept as shot/))
		.toBeInTheDocument();
	await page.getByRole('button', { name: 'Add 1 page' }).click();

	await expect.element(page.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
	await vi.waitFor(() =>
		expect(onChange).toHaveBeenLastCalledWith(['https://example.com/new.webp'])
	);
	expect(uploads).toHaveBeenCalledTimes(1);
});
