import { vi } from 'vitest';
import type {
	DisplayUploadRequest,
	FinalizeRequest,
	OriginalUploadGrant,
	OriginalUploadRequest,
	UploadedImage
} from '$lib/images/types';
import { paintedCanvas } from './scanner';

// Browser-mode fixtures for the photograph uploader: photos made on a canvas,
// and the image endpoints and the bucket, faked at `fetch` and
// `XMLHttpRequest`. Undo with `vi.restoreAllMocks()` and
// `vi.unstubAllGlobals()`.

/** A canvas-made photo, the way a photo picker hands one over. */
export async function canvasPhoto(
	name: string,
	{ width = 320, height = 240, type = 'image/png' } = {}
): Promise<File> {
	const canvas = paintedCanvas(width, height);
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
	canvas.width = 0;
	canvas.height = 0;
	return new File([blob!], name, { type });
}

/**
 * A JPEG whose pixels are stored `width`×`height` but whose EXIF says to
 * rotate it 90° clockwise (orientation 6), as a phone held upright saves one.
 * Shown correctly, it is `height`×`width`.
 */
export async function sidewaysJpeg(name: string, width = 320, height = 240): Promise<File> {
	const jpeg = new Uint8Array(
		await (await canvasPhoto(name, { width, height, type: 'image/jpeg' })).arrayBuffer()
	);
	// APP1: "Exif\0\0", then a big-endian TIFF header and one IFD entry:
	// Orientation (0x0112), SHORT, count 1, value 6.
	const tiff = [
		...[0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08],
		...[0x00, 0x01],
		...[0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00],
		...[0x00, 0x00, 0x00, 0x00]
	];
	const payload = [...new TextEncoder().encode('Exif\0\0'), ...tiff];
	const length = payload.length + 2;
	const app1 = Uint8Array.of(0xff, 0xe1, length >> 8, length & 0xff, ...payload);
	// Right after the SOI marker, where cameras put it.
	const bytes = new Uint8Array(jpeg.length + app1.length);
	bytes.set(jpeg.subarray(0, 2));
	bytes.set(app1, 2);
	bytes.set(jpeg.subarray(2), 2 + app1.length);
	return new File([bytes], name, { type: 'image/jpeg' });
}

/**
 * A file that sniffs as HEIC (an ISO-BMFF `ftyp` box with the `heic` brand)
 * but that no browser can decode: there is no image in it. Stands in for an
 * iPhone photo in a browser without a HEIC decoder.
 */
export function heicLike(name: string): File {
	const ftyp = [
		...[0x00, 0x00, 0x00, 0x18],
		...new TextEncoder().encode('ftypheic'),
		...[0x00, 0x00, 0x00, 0x00],
		...new TextEncoder().encode('mif1heic')
	];
	return new File([Uint8Array.from([...ftyp, ...new Array(64).fill(0)])], name, {
		type: 'image/heic'
	});
}

export function textFile(name: string): File {
	return new File(['Not a photograph, just some notes.\n'], name, { type: 'text/plain' });
}

export async function bytesOf(blob: Blob): Promise<Uint8Array> {
	return new Uint8Array(await blob.arrayBuffer());
}

export async function dimensionsOf(blob: Blob): Promise<{ width: number; height: number }> {
	const bitmap = await createImageBitmap(blob);
	const { width, height } = bitmap;
	bitmap.close();
	return { width, height };
}

/** One PUT the uploader made, as the fake bucket received it. */
export type RecordedPut = {
	url: string;
	/** Exactly the headers the uploader set. */
	headers: Record<string, string>;
	body: Blob;
	aborted: boolean;
	/** Answered or aborted. */
	settled: boolean;
	/** Answer it (200 by default). The fake answers by itself unless `holdPuts` is set. */
	respond(status?: number, text?: string): void;
};

const EXTENSIONS: Record<string, string> = {
	'image/webp': 'webp',
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/heic': 'heic'
};

const LOCKED = { message: 'Visit the Cube to open the Archive.', code: 'locked' };

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * The /api/images endpoints and the bucket they hand out URLs for. Every
 * request is recorded for the test to inspect. Each original is given id
 * `100 + n` (n counting originals from 0), whatever order they finalize in,
 * so `idOf(name)` is stable.
 *
 * Other requests (the WebP encoder fetching its .wasm, say) go through.
 */
export function fakeImageServer() {
	const originals: OriginalUploadRequest[] = [];
	const grants: OriginalUploadGrant[] = [];
	const displays: DisplayUploadRequest[] = [];
	/** Finalize requests as they arrive, answered or not. */
	const finalizing: FinalizeRequest[] = [];
	/** Finalize requests answered, with what was answered. */
	const finalized: { request: FinalizeRequest; image: UploadedImage }[] = [];
	const deleted: number[] = [];
	/** Every request to /api/images, in order. */
	const requests: string[] = [];
	const puts: RecordedPut[] = [];
	const heldFinalizes: Array<() => void> = [];

	const control = {
		/** Leave PUTs unanswered until the test calls `respond`. */
		holdPuts: false,
		/** Leave finalize unanswered until `releaseFinalize()`. */
		holdFinalize: false,
		/** Answer upload URL requests with the server's locked 401. */
		locked: false
	};

	const realFetch = globalThis.fetch.bind(globalThis);
	const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const method = init?.method ?? 'GET';
		if (!url.startsWith('/api/')) return realFetch(input, init);
		requests.push(`${method} ${url}`);
		const body = init?.body ? JSON.parse(String(init.body)) : null;

		if (url === '/api/images/upload-url' && method === 'POST') {
			if (control.locked) return json(LOCKED, 401);
			if (body.object === 'original') {
				const request = body as OriginalUploadRequest;
				const n = originals.push(request) - 1;
				const prefix = `images/0000000${n}-test`;
				const originalKey = `${prefix}/original.${EXTENSIONS[request.type]}`;
				const grant: OriginalUploadGrant = {
					originalKey,
					displayKey: `${prefix}/display.webp`,
					ticket: `ticket-${n}`,
					upload: {
						url: `https://bucket.test/${originalKey}?X-Amz-Signature=original-${n}`,
						headers: { 'Content-Type': request.type }
					}
				};
				grants.push(grant);
				return json(grant);
			}
			const request = body as DisplayUploadRequest;
			displays.push(request);
			const grant = grants.find((g) => g.originalKey === request.originalKey);
			if (!grant || grant.ticket !== request.ticket) {
				return json({ message: 'Forbidden: not your upload' }, 403);
			}
			return json({
				upload: {
					url: `https://bucket.test/${grant.displayKey}?X-Amz-Signature=display`,
					headers: { 'Content-Type': 'image/webp' }
				}
			});
		}

		if (url === '/api/images/finalize' && method === 'POST') {
			const request = body as FinalizeRequest;
			finalizing.push(request);
			if (control.holdFinalize) await new Promise<void>((resolve) => heldFinalizes.push(resolve));
			const n = grants.findIndex((g) => g.originalKey === request.originalKey);
			const image: UploadedImage = {
				id: 100 + n,
				url: `https://bucket.test/${request.displayKey}`,
				originalUrl: `https://bucket.test/${request.originalKey}`,
				width: 1,
				height: 1,
				capturedAt: null
			};
			finalized.push({ request, image });
			return json(image);
		}

		const match = /^\/api\/images\/(\d+)$/.exec(url);
		if (match && method === 'DELETE') {
			deleted.push(Number(match[1]));
			return json({ success: true });
		}

		throw new Error(`Unexpected request: ${method} ${url}`);
	});

	class FakeXMLHttpRequest {
		upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		onabort: (() => void) | null = null;
		status = 0;
		responseText = '';
		#url = '';
		#headers: Record<string, string> = {};
		#put: RecordedPut | null = null;
		#done = false;

		open(method: string, url: string) {
			if (method !== 'PUT') throw new Error(`Unexpected ${method} ${url}`);
			this.#url = url;
		}

		setRequestHeader(name: string, value: string) {
			this.#headers[name] = value;
		}

		send(body: Blob) {
			const put: RecordedPut = {
				url: this.#url,
				headers: this.#headers,
				body,
				aborted: false,
				settled: false,
				respond: (status = 200, text = '') => {
					if (this.#done) return;
					this.#done = true;
					put.settled = true;
					const size = body.size;
					this.upload.onprogress?.(
						new ProgressEvent('progress', { loaded: size, total: size, lengthComputable: true })
					);
					this.status = status;
					this.responseText = text;
					this.onload?.();
				}
			};
			this.#put = put;
			puts.push(put);
			if (!control.holdPuts) setTimeout(() => put.respond());
		}

		abort() {
			if (this.#done) return;
			this.#done = true;
			if (this.#put) Object.assign(this.#put, { aborted: true, settled: true });
			this.onabort?.();
		}
	}
	vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);

	return {
		fetch,
		control,
		originals,
		grants,
		displays,
		finalizing,
		finalized,
		deleted,
		requests,
		puts,
		/** PUTs sent and neither answered nor aborted. */
		inFlight: () => puts.filter((put) => !put.settled),
		/** The id the fake gave the photograph picked as `name`. */
		idOf(name: string) {
			const n = originals.findIndex((request) => request.name === name);
			if (n < 0) throw new Error(`No original named ${name}`);
			return 100 + n;
		},
		/** The original and display PUTs for the photograph picked as `name`. */
		putsOf(name: string) {
			const grant = grants[originals.findIndex((request) => request.name === name)];
			if (!grant) throw new Error(`No original named ${name}`);
			return {
				original: puts.find((put) => put.url.includes(`/${grant.originalKey}?`)),
				display: puts.find((put) => put.url.includes(`/${grant.displayKey}?`))
			};
		},
		releaseFinalize() {
			control.holdFinalize = false;
			for (const resolve of heldFinalizes.splice(0)) resolve();
		}
	};
}
