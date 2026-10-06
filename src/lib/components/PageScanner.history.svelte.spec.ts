import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PageScanner from './PageScanner.svelte';
import { page as appPage } from '$lib/testing/shallow-routing.svelte';

// The back gesture, through real history entries: a router stand-in replaces
// SvelteKit's, which won't run outside an app.
vi.mock('$app/navigation', async () => {
	const { pushState } = await import('$lib/testing/shallow-routing.svelte');
	return { pushState };
});
vi.mock('$app/state', async () => {
	const { page } = await import('$lib/testing/shallow-routing.svelte');
	return { page };
});

const URLS = ['https://example.com/scan1.jpg', 'https://example.com/scan2.jpg'];

function fakeCamera() {
	const canvas = document.createElement('canvas');
	canvas.width = 640;
	canvas.height = 480;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#222';
	ctx.fillRect(0, 0, 640, 480);
	ctx.fillStyle = '#fff';
	ctx.fillRect(80, 60, 480, 360);
	vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(canvas.captureStream(30));
}

function fakeServer() {
	let count = 0;
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
		if (init?.method === 'DELETE') return new Response(null, { status: 204 });
		count += 1;
		return new Response(
			JSON.stringify({ url: `https://example.com/new-${count}.webp`, fileName: `n${count}.webp` }),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	});
}

async function openCamera(name = 'Scan pages') {
	await page.getByRole('button', { name }).click();
	const shutter = page.getByRole('button', { name: /^(Capture|Retake) page$/ });
	await expect.element(shutter).not.toHaveAttribute('aria-disabled', 'true');
	return shutter;
}

const onOwnEntry = () => typeof appPage.state.immersive === 'string';

afterEach(() => {
	vi.restoreAllMocks();
	appPage.state = {};
});

it('closes the camera on back when nothing was shot, without leaving the page', async () => {
	fakeCamera();
	const href = location.href;
	render(PageScanner, {});
	await openCamera();
	expect(onOwnEntry()).toBe(true);

	history.back();

	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	expect(location.href).toBe(href);
	expect(onOwnEntry()).toBe(false);
});

it('moves on to cropping on back once something is shot, and finishes on the next back', async () => {
	fakeCamera();
	fakeServer();
	const onChange = vi.fn();
	render(PageScanner, { onChange });
	const shutter = await openCamera();
	await shutter.click();
	await shutter.click();

	history.back();
	await expect.element(page.getByText('Photo 1 of 2')).toBeInTheDocument();
	// Ready for another back: the view stands on a fresh entry of its own.
	await vi.waitFor(() => expect(onOwnEntry()).toBe(true));

	history.back();
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	await vi.waitFor(() => expect(onChange.mock.lastCall?.[0]).toHaveLength(2));
});

it('drops its history entry when closed from inside, so the next back is a real back', async () => {
	fakeCamera();
	render(PageScanner, {});
	await openCamera();
	expect(onOwnEntry()).toBe(true);

	await page.getByRole('button', { name: 'Close camera' }).click();

	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	await vi.waitFor(() => expect(onOwnEntry()).toBe(false));
});

it('cancels a retake on back from its crop step, keeping the page', async () => {
	fakeCamera();
	const server = fakeServer();
	const onChange = vi.fn();
	render(PageScanner, { initial: URLS, onChange });
	const shutter = await openCamera('Retake page 1');
	await shutter.click();
	await expect.element(page.getByText('New photo for page 1')).toBeInTheDocument();

	history.back();

	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	expect(server).not.toHaveBeenCalled();
	expect(onChange).not.toHaveBeenCalled();
});
