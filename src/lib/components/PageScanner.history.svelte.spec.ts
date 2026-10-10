import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PageScanner from './PageScanner.svelte';
import { pushState } from '$app/navigation';
import { page as appPage } from '$lib/testing/shallow-routing.svelte';

// The back gesture, through real history entries: a router stand-in replaces
// SvelteKit's, which won't run outside an app.
vi.mock('$app/navigation', async () => {
	const nav = await import('$lib/testing/shallow-routing.svelte');
	return {
		pushState: vi.fn(nav.pushState),
		onNavigate: nav.onNavigate,
		afterNavigate: nav.afterNavigate
	};
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

it('never adds a history entry in answer to back, only to a tap', async () => {
	fakeCamera();
	render(PageScanner, {});
	const pushes = () => vi.mocked(pushState).mock.calls.length;
	const before = pushes();
	const shutter = await openCamera();
	await shutter.click();
	await shutter.click();
	// Opening, then the first photo: one entry each, both from taps.
	expect(pushes() - before).toBe(2);

	history.back();
	await expect.element(page.getByText('Photo 1 of 2')).toBeInTheDocument();

	// Chrome's back skips entries added without a tap, so one added here would
	// send the next back gesture out of the app.
	expect(pushes() - before).toBe(2);
	expect(onOwnEntry()).toBe(true);
});

it('stacks the second entry again on Back to camera, a tap', async () => {
	fakeCamera();
	fakeServer();
	render(PageScanner, {});
	const shutter = await openCamera();
	await shutter.click();
	await page.getByRole('button', { name: /^Done, crop/ }).click();
	await expect.element(page.getByText('Photo 1 of 1')).toBeInTheDocument();

	await page.getByRole('button', { name: 'Back to camera' }).click();
	await expect.element(page.getByRole('button', { name: 'Capture page' })).toBeInTheDocument();

	history.back();
	await expect.element(page.getByText('Photo 1 of 1')).toBeInTheDocument();
	history.back();
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
});

it('never stands on an entry left by an earlier open', async () => {
	fakeCamera();
	render(PageScanner, {});
	await openCamera();
	history.back();
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();

	// Forward onto the closed view's old entry is undone, so no later back is
	// spent getting off it.
	history.forward();
	await vi.waitFor(() => expect(history.state).toBeNull(), { timeout: 2000 });
	expect(page.getByRole('dialog').query()).toBeNull();

	// A new open takes fresh entries: one back closes it.
	await openCamera();
	history.back();
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
});

it('takes its entries along when unmounted while open', async () => {
	fakeCamera();
	const { unmount } = render(PageScanner, {});
	await openCamera();
	expect(onOwnEntry()).toBe(true);

	unmount();

	await vi.waitFor(() => expect(onOwnEntry()).toBe(false));
});
