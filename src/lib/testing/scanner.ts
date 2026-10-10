import { page } from 'vitest/browser';
import { expect, vi } from 'vitest';

// Browser-mode fixtures for the scanner: canvases, a camera, the scans endpoint,
// and the camera run's steps.

/** A small canvas with something on it, for encoding. */
export function paintedCanvas(width = 64, height = 48): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#c33';
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = '#39c';
	ctx.fillRect(width / 8, height / 8, width / 2, height / 2);
	return canvas;
}

/** A PNG the way a photo picker hands one over. */
export async function pickedPhoto(name: string): Promise<File> {
	const blob = await new Promise<Blob | null>((resolve) =>
		paintedCanvas(320, 240).toBlob(resolve, 'image/png')
	);
	return new File([blob!], name, { type: 'image/png' });
}

/**
 * Make canvases encode the way WebKit's do. WebKit has no WebP encoder, so a
 * WebP request quietly comes back as a lossless PNG with the quality ignored;
 * every other type still encodes for real. Lets Chromium-run tests cover the
 * iPhone path. Undone by `vi.restoreAllMocks()`.
 */
export function simulateWebKitCanvas() {
	const proto = HTMLCanvasElement.prototype;
	const { toDataURL, toBlob } = proto;

	const toDataURLSpy = vi.spyOn(proto, 'toDataURL').mockImplementation(function (
		this: HTMLCanvasElement,
		type?: string,
		quality?: number
	) {
		return type === 'image/webp'
			? toDataURL.call(this, 'image/png')
			: toDataURL.call(this, type, quality);
	});
	const toBlobSpy = vi.spyOn(proto, 'toBlob').mockImplementation(function (
		this: HTMLCanvasElement,
		callback: BlobCallback,
		type?: string,
		quality?: number
	) {
		if (type === 'image/webp') toBlob.call(this, callback, 'image/png');
		else toBlob.call(this, callback, type, quality);
	});

	return { toDataURL: toDataURLSpy, toBlob: toBlobSpy };
}

/** A real MediaStream with no permission prompt and no camera hardware. */
export function fakeCamera() {
	const canvas = document.createElement('canvas');
	canvas.width = 640;
	canvas.height = 480;
	const ctx = canvas.getContext('2d')!;
	// A fresh stream per call, as a real camera gives (closing the camera stops
	// the last one), painted after it is made: a canvas stream only emits a
	// frame when the canvas is drawn.
	return vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockImplementation(async () => {
		const stream = canvas.captureStream(30);
		ctx.fillStyle = '#222';
		ctx.fillRect(0, 0, 640, 480);
		ctx.fillStyle = '#fff';
		ctx.fillRect(80, 60, 480, 360);
		return stream;
	});
}

/**
 * The scans endpoint: every upload succeeds with its own URL, and the
 * uploaded images and deleted URLs are kept for the test to inspect.
 */
export function fakeServer() {
	const uploads: File[] = [];
	const deleted: string[] = [];
	const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
		if (init?.method === 'DELETE') {
			deleted.push((JSON.parse(String(init.body)) as { url: string }).url);
			return new Response(null, { status: 204 });
		}
		uploads.push((init?.body as FormData).get('file') as File);
		const n = uploads.length;
		return new Response(
			JSON.stringify({ url: `https://example.com/new-${n}.webp`, fileName: `new-${n}.webp` }),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	});
	return { fetch, uploads, deleted };
}

export async function widthOf(blob: Blob) {
	const bitmap = await createImageBitmap(blob);
	const { width } = bitmap;
	bitmap.close();
	return width;
}

/** Open the camera and wait until the shutter works. */
export async function openCamera(name = 'Scan pages') {
	await page.getByRole('button', { name }).click();
	const shutter = page.getByRole('button', { name: /^(Capture|Retake) page$/ });
	await expect.element(shutter).not.toHaveAttribute('aria-disabled', 'true');
	return shutter;
}

/** Shoot `count` photos, then move on to cropping them. */
export async function shootAndCrop(count: number) {
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
