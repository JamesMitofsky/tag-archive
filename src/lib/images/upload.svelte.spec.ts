import { afterEach, describe, expect, it, vi } from 'vitest';
import { sniffImageType } from '$lib/imageType';
import { createSerialQueue } from '$lib/scanner/serial';
import {
	bytesOf,
	canvasPhoto,
	dimensionsOf,
	fakeImageServer,
	heicLike,
	textFile
} from '$lib/testing/images';
import { UNREADABLE_PHOTO } from './decode';
import {
	createLimiter,
	putWithProgress,
	STALL_MS,
	UNSUPPORTED_PHOTO,
	uploadImage,
	UploadError,
	type UploadStage
} from './upload';

// Chromium encodes WebP natively; the WebKit path is in encode.webkit.svelte.spec.ts.
// libheif is stood in for by a converter returning a real JPEG (see decode.svelte.spec.ts).
vi.mock('./heic', () => ({
	heicToJpeg: vi.fn(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 400;
		canvas.height = 300;
		canvas.getContext('2d')!.fillRect(0, 0, 200, 150);
		return new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/jpeg'));
	})
}));

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('uploadImage', () => {
	it('uploads the original untouched and a WebP display copy, then finalizes', async () => {
		const server = fakeImageServer();
		const photo = await canvasPhoto('IMG_0001.PNG', { width: 3000, height: 2000 });
		const stages: UploadStage[] = [];
		const fractions: number[] = [];

		const image = await uploadImage(photo, {
			heavy: createSerialQueue(),
			onStage: (stage) => stages.push(stage),
			onProgress: (fraction) => fractions.push(fraction)
		});

		const [grant] = server.grants;
		expect(server.originals).toEqual([
			{ object: 'original', type: 'image/png', size: photo.size, name: 'IMG_0001.PNG' }
		]);
		const { original, display } = server.putsOf('IMG_0001.PNG');
		expect(original!.headers).toEqual({ 'Content-Type': 'image/png' });
		expect(await bytesOf(original!.body)).toEqual(await bytesOf(photo));

		expect(display!.headers).toEqual({ 'Content-Type': 'image/webp' });
		expect(sniffImageType(await bytesOf(display!.body))).toBe('image/webp');
		expect(await dimensionsOf(display!.body)).toEqual({ width: 2560, height: 1707 });
		expect(server.displays).toEqual([
			{
				object: 'display',
				originalKey: grant.originalKey,
				ticket: grant.ticket,
				size: display!.body.size
			}
		]);

		expect(server.finalizing).toEqual([
			{ originalKey: grant.originalKey, displayKey: grant.displayKey, name: 'IMG_0001.PNG' }
		]);
		expect(image.id).toBe(server.idOf('IMG_0001.PNG'));

		expect(stages[0]).toBe('reading');
		expect(stages.slice(-2)).toEqual(['finalizing', 'done']);
		expect(fractions.at(-1)).toBe(1);
		expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
	});

	it('refuses a file that is not a photograph before asking for anything', async () => {
		const server = fakeImageServer();
		const stages: UploadStage[] = [];

		const upload = uploadImage(textFile('notes.txt'), {
			heavy: createSerialQueue(),
			onStage: (stage) => stages.push(stage)
		});

		await expect(upload).rejects.toThrow(UNSUPPORTED_PHOTO);
		expect(server.requests).toEqual([]);
		expect(server.puts).toEqual([]);
		expect(stages.at(-1)).toBe('error');
	});

	it('converts a HEIC the browser cannot decode, and uploads the HEIC itself as the original', async () => {
		const server = fakeImageServer();
		const heic = heicLike('IMG_0002.HEIC');

		await uploadImage(heic, { heavy: createSerialQueue() });

		const { original, display } = server.putsOf('IMG_0002.HEIC');
		expect(server.originals[0].type).toBe('image/heic');
		expect(original!.headers).toEqual({ 'Content-Type': 'image/heic' });
		expect(await bytesOf(original!.body)).toEqual(await bytesOf(heic));
		expect(sniffImageType(await bytesOf(display!.body))).toBe('image/webp');
		expect(await dimensionsOf(display!.body)).toEqual({ width: 400, height: 300 });
		expect(server.finalizing).toHaveLength(1);
	});

	it('stops the original upload when no display copy can be made', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		// PNG's signature, then nothing a decoder can use.
		const png = new File(
			[Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(32).fill(0))],
			'corrupt.png',
			{ type: 'image/png' }
		);

		await expect(uploadImage(png, { heavy: createSerialQueue() })).rejects.toThrow(
			UNREADABLE_PHOTO
		);
		expect(server.puts).toHaveLength(1);
		expect(server.puts[0].aborted).toBe(true);
		expect(server.finalizing).toEqual([]);
	});

	it('hands over the display copy as soon as it is encoded, but uploads it only after the original', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		const onDisplay = vi.fn();
		const stages: UploadStage[] = [];

		const upload = uploadImage(await canvasPhoto('IMG_0003.PNG'), {
			heavy: createSerialQueue(),
			onDisplay,
			onStage: (stage) => stages.push(stage)
		});

		// The original is still on its way; the preview needn't wait for it…
		await vi.waitFor(() => expect(onDisplay).toHaveBeenCalledOnce());
		expect(server.inFlight()).toHaveLength(1);
		expect(sniffImageType(await bytesOf(onDisplay.mock.calls[0][0]))).toBe('image/webp');
		// …and the tile keeps saying so, rather than that it is preparing.
		expect(stages).toEqual(['reading', 'uploading']);
		// The display copy's URL is asked for once the original has landed.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(server.displays).toEqual([]);

		server.control.holdPuts = false;
		server.inFlight()[0].respond();
		await upload;
		expect(server.displays).toHaveLength(1);
		expect(onDisplay).toHaveBeenCalledOnce();
	});

	it('makes the display copy on the shared queue', async () => {
		fakeImageServer();
		const heavy = createSerialQueue();
		const run = vi.spyOn(heavy, 'run');

		await uploadImage(await canvasPhoto('IMG_0007.PNG'), { heavy });

		expect(run).toHaveBeenCalledOnce();
	});

	it('skips the display copy of an upload aborted while it waited its turn', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		const heavy = createSerialQueue();
		let unblock!: () => void;
		const busy = heavy.run(() => new Promise<void>((resolve) => (unblock = resolve)));
		const photo = await canvasPhoto('IMG_0008.PNG');
		const decode = vi.spyOn(globalThis, 'createImageBitmap');
		const controller = new AbortController();

		const upload = uploadImage(photo, { heavy, signal: controller.signal });
		await vi.waitFor(() => expect(server.puts).toHaveLength(1));
		controller.abort();
		await expect(upload).rejects.toMatchObject({ name: 'AbortError' });

		unblock();
		await busy;
		// Runs only once everything queued before it has.
		await heavy.run(async () => {});
		expect(decode).not.toHaveBeenCalled();
	});

	it('asks for nothing when aborted before it starts', async () => {
		const server = fakeImageServer();
		const controller = new AbortController();
		controller.abort();

		const upload = uploadImage(await canvasPhoto('IMG_0009.PNG'), {
			heavy: createSerialQueue(),
			signal: controller.signal
		});

		await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
		expect(server.requests).toEqual([]);
		expect(server.puts).toEqual([]);
	});

	it('rejects with the server’s locked refusal', async () => {
		const server = fakeImageServer();
		server.control.locked = true;

		const error = await uploadImage(await canvasPhoto('IMG_0004.PNG'), {
			heavy: createSerialQueue()
		}).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(UploadError);
		expect(error).toMatchObject({
			status: 401,
			locked: true,
			message: 'Visit the Cube to open the Archive.'
		});
		expect(server.puts).toEqual([]);
	});

	it('takes the access gate’s plain 401 as the same locked refusal', async () => {
		const server = fakeImageServer();
		// hooks.server.ts turns a lapsed visitor away before the endpoint runs,
		// with SvelteKit's own error shape: no `code`.
		server.fetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ message: 'Visit the Cube to open the Archive' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const error = await uploadImage(await canvasPhoto('IMG_0010.PNG'), {
			heavy: createSerialQueue()
		}).catch((e: unknown) => e);

		expect(error).toMatchObject({
			status: 401,
			locked: true,
			message: 'Visit the Cube to open the Archive'
		});
	});

	it('stops when aborted mid-upload, and never finalizes', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		const controller = new AbortController();

		const upload = uploadImage(await canvasPhoto('IMG_0005.PNG'), {
			heavy: createSerialQueue(),
			signal: controller.signal
		});
		await vi.waitFor(() => expect(server.puts).toHaveLength(1));
		controller.abort();

		await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
		expect(server.puts[0].aborted).toBe(true);
		expect(server.finalizing).toEqual([]);
	});

	it('lets finalize finish once asked, so the caller can delete what it made', async () => {
		const server = fakeImageServer();
		server.control.holdFinalize = true;
		const controller = new AbortController();

		const upload = uploadImage(await canvasPhoto('IMG_0006.PNG'), {
			heavy: createSerialQueue(),
			signal: controller.signal
		});
		await vi.waitFor(() => expect(server.finalizing).toHaveLength(1));
		controller.abort();
		server.releaseFinalize();

		await expect(upload).resolves.toMatchObject({ id: server.idOf('IMG_0006.PNG') });
	});
});

describe('putWithProgress', () => {
	it('sends exactly the signed headers, leaving Content-Length to the browser', async () => {
		const server = fakeImageServer();
		const body = new Blob([new Uint8Array(1234)]);
		const progress = vi.fn();

		await putWithProgress(
			{
				url: 'https://bucket.test/key?sig',
				headers: { 'Content-Type': 'image/webp', 'Content-Length': '1234' }
			},
			body,
			{ onProgress: progress }
		);

		expect(server.puts[0].headers).toEqual({ 'Content-Type': 'image/webp' });
		expect(progress).toHaveBeenLastCalledWith(1234, 1234);
	});

	it('refuses a body of another size than the link was signed for, before sending it', async () => {
		const server = fakeImageServer();
		const put = putWithProgress(
			{ url: 'https://bucket.test/key?sig', headers: { 'Content-Length': '99' } },
			new Blob([new Uint8Array(100)])
		);
		await expect(put).rejects.toBeInstanceOf(UploadError);
		expect(server.puts).toEqual([]);
	});

	it('names the bucket’s refusal from its XML answer', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		const put = putWithProgress(
			{ url: 'https://bucket.test/key?sig', headers: {} },
			new Blob([new Uint8Array(10)])
		);
		server.puts[0].respond(
			403,
			'<?xml version="1.0"?><Error><Code>SignatureDoesNotMatch</Code><Message>…</Message></Error>'
		);

		const error = await put.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(UploadError);
		expect(error).toMatchObject({ status: 403, locked: false });
		expect((error as Error).message).toContain('SignatureDoesNotMatch');
	});

	it('gives up on a PUT that stops making progress', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const put = putWithProgress(
				{ url: 'https://bucket.test/key?sig', headers: {} },
				new Blob([new Uint8Array(10)])
			);
			const outcome = put.catch((e: unknown) => e);

			vi.advanceTimersByTime(STALL_MS - 1);
			expect(server.puts[0].settled).toBe(false);
			vi.advanceTimersByTime(1);

			const error = await outcome;
			expect(error).toBeInstanceOf(UploadError);
			expect(error).toMatchObject({ status: 0 });
			expect(server.puts[0].aborted).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('passes on the server’s own message, as the dev proxy sends it', async () => {
		const server = fakeImageServer();
		server.control.holdPuts = true;
		const put = putWithProgress(
			{ url: '/api/images/put?sig', headers: {} },
			new Blob([new Uint8Array(10)])
		);
		server.puts[0].respond(
			400,
			JSON.stringify({ message: 'This upload link takes exactly 9 bytes' })
		);

		await expect(put).rejects.toThrow('This upload link takes exactly 9 bytes');
	});
});

describe('createLimiter', () => {
	it('hands out at most its limit, urgent waiters first', async () => {
		const limiter = createLimiter(2);
		const order: string[] = [];
		const take = (name: string, urgent = false) =>
			limiter.acquire({ urgent }).then((release) => {
				order.push(name);
				return release;
			});

		const a = await take('a');
		await take('b');
		const c = take('c');
		const d = take('d', true);
		await Promise.resolve();
		expect(order).toEqual(['a', 'b']);

		a();
		await d;
		expect(order).toEqual(['a', 'b', 'd']);
		// Releasing twice gives back one slot, not two.
		a();
		await Promise.resolve();
		expect(order).toEqual(['a', 'b', 'd']);
		(await d)();
		await c;
		expect(order).toEqual(['a', 'b', 'd', 'c']);
	});

	it('hands out one slot at a time when given no usable limit, rather than none ever', async () => {
		for (const limit of [0, -1, Number.NaN]) {
			const limiter = createLimiter(limit);
			const release = await limiter.acquire();
			let second = false;
			const next = limiter.acquire().then((r) => {
				second = true;
				return r;
			});
			await Promise.resolve();
			expect(second).toBe(false);
			release();
			await next;
			expect(second).toBe(true);
		}
	});

	it('drops a waiter whose signal aborts', async () => {
		const limiter = createLimiter(1);
		const release = await limiter.acquire();
		const controller = new AbortController();
		const waiting = limiter.acquire({ signal: controller.signal });
		const next = limiter.acquire();

		controller.abort();
		await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
		release();
		// The slot goes to the next waiter rather than to the one that left.
		await expect(next).resolves.toBeTypeOf('function');
	});
});
