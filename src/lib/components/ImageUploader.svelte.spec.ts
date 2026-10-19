import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ImageUploader from './ImageUploader.svelte';
import { sniffImageType } from '$lib/imageType';
import type { UploadedImage } from '$lib/images/types';
import { bytesOf, canvasPhoto, dimensionsOf, fakeImageServer, textFile } from '$lib/testing/images';
import { paintedCanvas } from '$lib/testing/scanner';

// Chromium encodes WebP natively. The WebKit (iPhone) path, which can't, is
// covered in ImageUploader.webkit.svelte.spec.ts.

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

/** Photographs already in a set, as the edit page seeds them. Data URLs: nothing to fetch. */
function initialImages(): UploadedImage[] {
	return [7, 8, 9].map((id) => ({
		id,
		url: paintedCanvas(8, 8).toDataURL('image/png'),
		originalUrl: `https://bucket.test/images/${id}/original.jpg`,
		width: 8,
		height: 8,
		capturedAt: null
	}));
}

const picker = () => page.getByLabelText('Add photographs');

describe('ImageUploader.svelte', () => {
	it('takes several photographs at once, HEIC included', async () => {
		render(ImageUploader, {});
		await expect.element(picker()).toBeInTheDocument();

		const input = document.querySelector('input[type="file"]') as HTMLInputElement;
		expect(input.multiple).toBe(true);
		expect(input.accept.split(',')).toEqual(expect.arrayContaining(['image/*', '.heic', '.heif']));
	});

	it('names its group with its label, marked required when it is', async () => {
		render(ImageUploader, { label: 'Photographs', required: true });

		const group = page.getByRole('group', { name: 'Photographs' });
		await expect.element(group).toBeInTheDocument();
		await expect.element(group.getByTitle('Required')).toHaveTextContent('*');
	});

	it('uploads each original untouched and a WebP display copy of it, then emits ids in order', async () => {
		const server = fakeImageServer();
		const onChange = vi.fn();
		render(ImageUploader, { onChange });
		const big = await canvasPhoto('big.png', { width: 3000, height: 2000 });
		const small = await canvasPhoto('small.png');

		await picker().upload([big, small]);

		await vi.waitFor(
			() =>
				expect(onChange).toHaveBeenLastCalledWith([
					server.idOf('big.png'),
					server.idOf('small.png')
				]),
			{ timeout: 10_000 }
		);

		for (const [file, size] of [
			[big, { width: 2560, height: 1707 }],
			[small, { width: 320, height: 240 }]
		] as const) {
			const n = server.originals.findIndex((o) => o.name === file.name);
			const grant = server.grants[n];
			const { original, display } = server.putsOf(file.name);

			expect(server.originals[n]).toEqual({
				object: 'original',
				type: 'image/png',
				size: file.size,
				name: file.name
			});
			expect(original!.headers).toEqual({ 'Content-Type': 'image/png' });
			expect(await bytesOf(original!.body)).toEqual(await bytesOf(file));

			expect(display!.headers).toEqual({ 'Content-Type': 'image/webp' });
			expect(sniffImageType(await bytesOf(display!.body))).toBe('image/webp');
			expect(await dimensionsOf(display!.body)).toEqual(size);
			expect(server.displays).toContainEqual({
				object: 'display',
				originalKey: grant.originalKey,
				ticket: grant.ticket,
				size: display!.body.size
			});
			expect(server.finalizing).toContainEqual({
				originalKey: grant.originalKey,
				displayKey: grant.displayKey,
				name: file.name
			});
		}
	});

	it('emits ids in tile order, not in the order uploads finish', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		const onChange = vi.fn();
		render(ImageUploader, { onChange });
		await picker().upload([await canvasPhoto('first.png'), await canvasPhoto('second.png')]);
		await vi.waitFor(() => expect(server.inFlight()).toHaveLength(2));

		// The second photograph finishes first…
		server.putsOf('second.png').original!.respond();
		await vi.waitFor(() => expect(server.putsOf('second.png').display).toBeDefined());
		server.putsOf('second.png').display!.respond();
		await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith([server.idOf('second.png')]));

		// …and still comes second once the first lands.
		server.control.holdPuts = false;
		server.putsOf('first.png').original!.respond();
		await vi.waitFor(() =>
			expect(onChange).toHaveBeenLastCalledWith([
				server.idOf('first.png'),
				server.idOf('second.png')
			])
		);
	});

	it('shows the display copy once it is made', async () => {
		fakeImageServer();
		const createObjectURL = vi.spyOn(URL, 'createObjectURL');
		const onChange = vi.fn();
		render(ImageUploader, { onChange });

		await picker().upload(await canvasPhoto('IMG_0001.PNG'));
		await vi.waitFor(() => expect(onChange).toHaveBeenCalledOnce());

		const preview = createObjectURL.mock.calls.findIndex(
			([blob]) => blob instanceof Blob && blob.type === 'image/webp'
		);
		expect(preview).toBeGreaterThanOrEqual(0);
		await expect
			.element(page.getByRole('img', { name: 'Photograph 1' }))
			.toHaveAttribute('src', createObjectURL.mock.results[preview].value);
	});

	it('revokes every object URL it made, when replaced and when it goes away', async () => {
		fakeImageServer();
		const createObjectURL = vi.spyOn(URL, 'createObjectURL');
		const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
		const onChange = vi.fn();
		const { unmount } = render(ImageUploader, { onChange });

		await picker().upload([await canvasPhoto('a.png'), await canvasPhoto('b.png')]);
		await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith([100, 101]));
		const minted = createObjectURL.mock.results.map((result) => result.value as string);
		// The picked files', replaced by the display copies'.
		expect(minted).toHaveLength(4);
		expect(revokeObjectURL.mock.calls.map(([url]) => url)).toHaveLength(2);

		await unmount();
		expect(revokeObjectURL.mock.calls.map(([url]) => url).sort()).toEqual([...minted].sort());
	});

	it('emits the photographs it was given, and moves them', async () => {
		const onChange = vi.fn();
		render(ImageUploader, { initial: initialImages(), onChange });

		await expect.element(page.getByRole('img', { name: 'Photograph 3' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Move photograph 1 earlier' }))
			.toBeDisabled();
		await expect
			.element(page.getByRole('button', { name: 'Move photograph 3 later' }))
			.toBeDisabled();

		await page.getByRole('button', { name: 'Move photograph 1 later' }).click();
		expect(onChange).toHaveBeenLastCalledWith([8, 7, 9]);
		await page.getByRole('button', { name: 'Move photograph 3 earlier' }).click();
		expect(onChange).toHaveBeenLastCalledWith([8, 9, 7]);
	});

	it('leaves deleting a photograph it was given to the form', async () => {
		const server = fakeImageServer();
		const onChange = vi.fn();
		render(ImageUploader, { initial: initialImages(), onChange });

		await page.getByRole('button', { name: 'Remove photograph 2' }).click();

		expect(onChange).toHaveBeenLastCalledWith([7, 9]);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(server.requests).toEqual([]);
	});

	it('appends new photographs after the ones it was given', async () => {
		const server = fakeImageServer();
		const onChange = vi.fn();
		render(ImageUploader, { initial: initialImages(), onChange });

		await picker().upload(await canvasPhoto('new.png'));

		await vi.waitFor(() =>
			expect(onChange).toHaveBeenLastCalledWith([7, 8, 9, server.idOf('new.png')])
		);
	});

	it('deletes an uploaded photograph when it is removed', async () => {
		const server = fakeImageServer();
		const onChange = vi.fn();
		render(ImageUploader, { onChange });
		await picker().upload([await canvasPhoto('keep.png'), await canvasPhoto('drop.png')]);
		await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith([100, 101]));

		await page.getByRole('button', { name: 'Remove photograph 2' }).click();

		expect(onChange).toHaveBeenLastCalledWith([server.idOf('keep.png')]);
		await vi.waitFor(() => expect(server.deleted).toEqual([server.idOf('drop.png')]));
	});

	it('deletes a photograph removed while it was being finalized, without ever emitting it', async () => {
		const server = fakeImageServer();
		server.control.holdFinalize = true;
		const onChange = vi.fn();
		render(ImageUploader, { onChange });
		await picker().upload(await canvasPhoto('late.png'));
		await vi.waitFor(() => expect(server.finalizing).toHaveLength(1));

		await page.getByRole('button', { name: 'Remove photograph 1' }).click();
		server.releaseFinalize();

		await vi.waitFor(() => expect(server.deleted).toEqual([server.idOf('late.png')]));
		expect(onChange).not.toHaveBeenCalled();
		await expect.element(page.getByRole('img', { name: 'Photograph 1' })).not.toBeInTheDocument();
	});

	it('stops uploading a photograph removed mid-upload', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		const onChange = vi.fn();
		render(ImageUploader, { onChange });
		await picker().upload(await canvasPhoto('gone.png'));
		await vi.waitFor(() => expect(server.puts).toHaveLength(1));

		await page.getByRole('button', { name: 'Remove photograph 1' }).click();

		expect(server.puts[0].aborted).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(server.finalizing).toEqual([]);
		expect(server.deleted).toEqual([]);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('keeps at most three uploads in flight', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		const onChange = vi.fn();
		render(ImageUploader, { onChange });
		const names = ['1.png', '2.png', '3.png', '4.png', '5.png'];
		await picker().upload(await Promise.all(names.map((name) => canvasPhoto(name))));

		await vi.waitFor(() => expect(server.inFlight()).toHaveLength(3));
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(server.inFlight()).toHaveLength(3);
		// URLs are asked for only once a slot is free, so none waits out its expiry.
		expect(server.originals).toHaveLength(3);

		// Answer one at a time; never more than three at once on the way.
		while (onChange.mock.calls.at(-1)?.[0].length !== names.length) {
			await vi.waitFor(() => expect(server.inFlight().length).toBeGreaterThan(0));
			expect(server.inFlight().length).toBeLessThanOrEqual(3);
			server.inFlight()[0].respond();
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		expect(onChange).toHaveBeenLastCalledWith(names.map((name) => server.idOf(name)));
	});

	it('is pending while any photograph is still on its way', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		let pending = false;
		render(ImageUploader, {
			get pending() {
				return pending;
			},
			set pending(value: boolean) {
				pending = value;
			}
		});

		await picker().upload(await canvasPhoto('slow.png'));
		await vi.waitFor(() => expect(server.inFlight()).toHaveLength(1));
		expect(pending).toBe(true);

		server.control.holdPuts = false;
		server.inFlight()[0].respond();
		await vi.waitFor(() => expect(pending).toBe(false));
		expect(server.finalized).toHaveLength(1);
	});

	it('stops being pending when it goes away mid-upload', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		let pending = false;
		const { unmount } = render(ImageUploader, {
			get pending() {
				return pending;
			},
			set pending(value: boolean) {
				pending = value;
			}
		});
		await picker().upload(await canvasPhoto('abandoned.png'));
		await vi.waitFor(() => expect(server.inFlight()).toHaveLength(1));
		expect(pending).toBe(true);

		await unmount();

		expect(pending).toBe(false);
		expect(server.puts[0].aborted).toBe(true);
	});

	it('counts the photographs that failed, until each is tried again or removed', async () => {
		const server = fakeImageServer();
		server.control.locked = true;
		let failed = 0;
		const { unmount } = render(ImageUploader, {
			get failed() {
				return failed;
			},
			set failed(value: number) {
				failed = value;
			}
		});
		await picker().upload([
			await canvasPhoto('a.png'),
			await canvasPhoto('b.png'),
			await canvasPhoto('c.png')
		]);
		await vi.waitFor(() => expect(failed).toBe(3));

		// Tried again: on its way, so no longer failed (`pending` holds the form now).
		server.control.locked = false;
		await page.getByRole('button', { name: 'Retry photograph 1' }).click();
		await vi.waitFor(() => expect(failed).toBe(2));
		await vi.waitFor(() => expect(server.finalized).toHaveLength(1));
		expect(failed).toBe(2);

		await page.getByRole('button', { name: 'Remove photograph 2' }).click();
		await vi.waitFor(() => expect(failed).toBe(1));

		// Gone, nothing is left to try again.
		await unmount();
		expect(failed).toBe(0);
	});

	it('says once that the visit has lapsed, however many photographs it stopped', async () => {
		const server = fakeImageServer();
		server.control.locked = true;
		render(ImageUploader, {});

		await picker().upload([await canvasPhoto('a.png'), await canvasPhoto('b.png')]);

		const alert = page.getByRole('alert');
		await expect.element(alert).toHaveTextContent('Visit the Cube to open the Archive.');
		await expect.poll(() => alert.element().textContent?.split('Visit the Cube').length).toBe(2);
		await expect.element(page.getByText('Not uploaded').first()).toBeInTheDocument();
		expect(server.puts).toEqual([]);
	});

	it('retries every photograph the lapsed visit stopped, in order, once tapped again', async () => {
		const server = fakeImageServer();
		server.control.locked = true;
		const onChange = vi.fn();
		render(ImageUploader, { onChange });
		await picker().upload([await canvasPhoto('a.png'), await canvasPhoto('b.png')]);
		await vi.waitFor(() => expect(page.getByText('Not uploaded').all()).toHaveLength(2));

		server.control.locked = false;
		await page.getByRole('button', { name: 'Try again' }).click();

		await vi.waitFor(() =>
			expect(onChange).toHaveBeenLastCalledWith([server.idOf('a.png'), server.idOf('b.png')])
		);
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
	});

	it('retries a failed photograph', async () => {
		const server = fakeImageServer();
		server.control.locked = true;
		const onChange = vi.fn();
		render(ImageUploader, { onChange });
		await picker().upload(await canvasPhoto('again.png'));
		await expect.element(page.getByRole('alert')).toBeInTheDocument();

		server.control.locked = false;
		await page.getByRole('button', { name: 'Retry photograph 1' }).click();

		await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith([server.idOf('again.png')]));
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
	});

	it('shows why a photograph failed on its tile, and lets it be removed', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		render(ImageUploader, {});
		await picker().upload(await canvasPhoto('refused.png'));
		await vi.waitFor(() => expect(server.puts).toHaveLength(1));

		server.puts[0].respond(403, '<Error><Code>AccessDenied</Code></Error>');

		const alert = page.getByRole('alert');
		await expect
			.element(alert)
			.toHaveTextContent('refused.png: Storage refused the upload (AccessDenied)');
		await page.getByRole('button', { name: 'Remove photograph 1' }).click();
		await expect.element(alert).not.toBeInTheDocument();
		expect(server.deleted).toEqual([]);
	});

	it('refuses a file that is not a photograph without sending anything', async () => {
		const server = fakeImageServer();
		const onChange = vi.fn();
		render(ImageUploader, { onChange });

		await picker().upload(textFile('notes.txt'));

		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('notes.txt: Not a JPEG, PNG, WebP, GIF or HEIC photograph');
		await expect.element(page.getByRole('img', { name: 'Photograph 1' })).not.toBeInTheDocument();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(server.requests).toEqual([]);
		expect(server.puts).toEqual([]);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('refuses photographs past its limit, and says so', async () => {
		const server = fakeImageServer();
		const onChange = vi.fn();
		render(ImageUploader, { initial: initialImages().slice(0, 1), max: 3, onChange });

		await picker().upload([
			await canvasPhoto('a.png'),
			await canvasPhoto('b.png'),
			await canvasPhoto('c.png')
		]);

		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('A set holds at most 3 photographs, so 1 was not added.');
		await vi.waitFor(() =>
			expect(onChange).toHaveBeenLastCalledWith([7, server.idOf('a.png'), server.idOf('b.png')])
		);
		expect(server.originals.map((o) => o.name)).toEqual(['a.png', 'b.png']);
	});

	it('takes photographs dropped on it', async () => {
		const server = fakeImageServer();
		const onChange = vi.fn();
		const { container } = render(ImageUploader, { onChange });
		const zone = container.querySelector('[role="group"] > div')!;
		const files = new DataTransfer();
		files.items.add(await canvasPhoto('dropped.png'));

		zone.dispatchEvent(
			new DragEvent('dragenter', { dataTransfer: files, bubbles: true, cancelable: true })
		);
		await expect.element(page.getByText('Drop to add them')).toBeInTheDocument();
		const drop = new DragEvent('drop', { dataTransfer: files, bubbles: true, cancelable: true });
		zone.dispatchEvent(drop);

		// Taken here, not opened by the browser in place of the page.
		expect(drop.defaultPrevented).toBe(true);
		await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith([server.idOf('dropped.png')]));
		await expect.element(page.getByText('or drop them here')).toBeInTheDocument();
	});
});
