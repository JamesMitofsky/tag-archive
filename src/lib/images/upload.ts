import { sniffImageType, type ImageType } from '$lib/imageType';
import { releaseCanvas } from '$lib/scanner/image';
import type { SerialQueue } from '$lib/scanner/serial';
import { decodeImage } from './decode';
import { encodeWebP } from './encode';
import type {
	DisplayUploadGrant,
	DisplayUploadRequest,
	FinalizeRequest,
	OriginalUploadGrant,
	OriginalUploadRequest,
	PresignedPut,
	UploadedImage
} from './types';

/**
 * The browser side of uploading one photograph (see $lib/server/imageUploads
 * for the server side).
 *
 * Files go straight to the bucket with presigned PUTs: an original can be tens
 * of megabytes, far past what a function body carries. Each PUT URL is signed
 * for one exact type and size, so a photograph asks for two: one for the
 * original, untouched, as soon as it is picked, and one for its WebP display
 * copy once that is encoded and its size known. Finalize then has the server
 * read back and check what landed, and record it.
 */

const UPLOAD_URL_ENDPOINT = '/api/images/upload-url';
const FINALIZE_ENDPOINT = '/api/images/finalize';
const imageEndpoint = (id: number) => `/api/images/${id}`;

/**
 * PUTs in flight at once, across every photograph sharing a limiter. Enough
 * to keep a connection busy; few enough that the first photographs finish
 * (and count) early rather than fifty sharing the bandwidth and all finishing
 * last.
 */
export const MAX_PUTS_IN_FLIGHT = 3;

/**
 * Where one upload is, for its tile to say:
 *  - `reading`: checking the file, then waiting for a free upload slot;
 *  - `uploading`: bytes going up (the original, later the display copy);
 *  - `encoding`: making the display copy, which the upload is now waiting on;
 *  - `finalizing`: the server is checking what landed;
 *  - `done`, `error`: settled.
 */
export type UploadStage = 'reading' | 'uploading' | 'encoding' | 'finalizing' | 'done' | 'error';

/** Why an upload request failed, as the server (or the bucket) answered it. */
export class UploadError extends Error {
	/** The HTTP status; 0 when no answer came back at all. */
	readonly status: number;
	/**
	 * The "tap the tag again" refusal: the visitor's access has lapsed, which is
	 * about the session, not this file. Any 401 means that here. The endpoints
	 * answer it as `{ message, code: 'locked' }`, the edge gate in front of them
	 * likewise, but the same gate in hooks.server.ts (the only one under
	 * `vite dev`) as a plain `{ message }`, and nothing else on these paths
	 * answers 401.
	 */
	readonly locked: boolean;

	constructor(message: string, status: number, locked = false) {
		super(message);
		this.name = 'UploadError';
		this.status = status;
		this.locked = locked;
	}
}

/** Refusal for a file whose bytes aren't one of the types the archive takes. */
export const UNSUPPORTED_PHOTO = 'Not a JPEG, PNG, WebP, GIF or HEIC photograph';

const UNREACHABLE = 'The archive could not be reached. Check your connection.';
const INTERRUPTED = 'The upload was interrupted. Check your connection.';

/** How long a PUT may go without sending a byte before it counts as interrupted. */
export const STALL_MS = 2 * 60 * 1000;

/**
 * The type a file's leading bytes say it is, whatever its name or the
 * browser's guess. The server sniffs what lands again; this is only so the
 * upload URL is asked for with the right type, and so a file the archive
 * can't take is refused before anything is sent.
 */
export async function sniffFile(file: Blob): Promise<ImageType | null> {
	let head: Uint8Array;
	try {
		head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
	} catch {
		// Moved, deleted, or still downloading from a cloud photo library.
		throw new Error('This file could not be read');
	}
	return sniffImageType(head);
}

/** Ask for the original's upload URL. Charges the visitor's upload allowance. */
export function requestOriginalUpload(
	file: File,
	type: ImageType,
	signal?: AbortSignal
): Promise<OriginalUploadGrant> {
	const body: OriginalUploadRequest = {
		object: 'original',
		type,
		size: file.size,
		name: file.name
	};
	return postJson<OriginalUploadGrant>(UPLOAD_URL_ENDPOINT, body, signal);
}

/** Ask for the display copy's upload URL, for its exact encoded size. */
export async function requestDisplayUpload(
	grant: OriginalUploadGrant,
	size: number,
	signal?: AbortSignal
): Promise<PresignedPut> {
	const body: DisplayUploadRequest = {
		object: 'display',
		originalKey: grant.originalKey,
		ticket: grant.ticket,
		size
	};
	return (await postJson<DisplayUploadGrant>(UPLOAD_URL_ENDPOINT, body, signal)).upload;
}

/** Have the server check both objects and record the photograph. */
export function finalizeUpload(req: FinalizeRequest, signal?: AbortSignal): Promise<UploadedImage> {
	return postJson<UploadedImage>(FINALIZE_ENDPOINT, req, signal);
}

/**
 * Delete a finalized photograph that no form will attach. Best-effort: the
 * server sweeps unattached photographs anyway, so a failure here is only a
 * delay. `keepalive` lets a removal made just before leaving the page land.
 */
export async function deleteUploaded(id: number): Promise<void> {
	try {
		await fetch(imageEndpoint(id), { method: 'DELETE', keepalive: true });
	} catch {
		// Best-effort cleanup
	}
}

/**
 * PUT `body` to an upload URL, reporting bytes sent. XMLHttpRequest rather
 * than fetch, which can't report upload progress.
 *
 * `target.headers` are part of the URL's signature and are sent exactly as
 * given — except Content-Length, which the browser always derives from the
 * body (and refuses to have set). It must still match the signed size, so a
 * mismatch is refused here rather than as a 403 from the bucket.
 *
 * A PUT that makes no progress for `STALL_MS` is given up on as interrupted:
 * a connection can stall without ever failing, and the form waits on every
 * upload, so a stalled one would otherwise hold it up with no way forward.
 */
export function putWithProgress(
	target: PresignedPut,
	body: Blob,
	opts: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {}
): Promise<void> {
	const { onProgress, signal } = opts;
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason);

		const headers = Object.entries(target.headers);
		const length = headers.find(([name]) => name.toLowerCase() === 'content-length')?.[1];
		if (length !== undefined && Number(length) !== body.size) {
			return reject(new UploadError('This upload link was issued for a different file', 0));
		}

		const xhr = new XMLHttpRequest();
		const abort = () => xhr.abort();
		let stalled = false;
		let watchdog: ReturnType<typeof setTimeout> | undefined;
		const watch = () => {
			clearTimeout(watchdog);
			watchdog = setTimeout(() => {
				stalled = true;
				xhr.abort();
			}, STALL_MS);
		};
		const settle = (outcome: () => void) => {
			clearTimeout(watchdog);
			signal?.removeEventListener('abort', abort);
			outcome();
		};

		xhr.open('PUT', target.url);
		for (const [name, value] of headers) {
			if (name.toLowerCase() !== 'content-length') xhr.setRequestHeader(name, value);
		}
		xhr.upload.onprogress = (event) => {
			watch();
			onProgress?.(event.loaded, event.lengthComputable ? event.total : body.size);
		};
		xhr.onload = () =>
			settle(() => {
				if (xhr.status >= 200 && xhr.status < 300) {
					onProgress?.(body.size, body.size);
					resolve();
				} else {
					reject(storageError(xhr.status, xhr.responseText));
				}
			});
		// A network failure and a refused CORS preflight look the same from here.
		xhr.onerror = () => settle(() => reject(new UploadError(INTERRUPTED, 0)));
		xhr.onabort = () =>
			settle(() =>
				reject(
					stalled
						? new UploadError(INTERRUPTED, 0)
						: (signal?.reason ?? new DOMException('Upload aborted', 'AbortError'))
				)
			);

		signal?.addEventListener('abort', abort, { once: true });
		watch();
		xhr.send(body);
	});
}

/**
 * Hands out at most `limit` slots at a time. An upload holds one while it asks
 * for a URL and PUTs to it — asking only once a slot is free, so a URL never
 * waits out its expiry in a queue. Urgent waiters go first: a display copy's
 * PUT is what finishes a photograph, so it doesn't queue behind every
 * original still waiting to start.
 */
export type Limiter = {
	/**
	 * Wait for a slot; resolves with the function that gives it back (call it
	 * exactly once, when done). Rejects and leaves the queue if `signal` aborts
	 * first.
	 */
	acquire(opts?: { urgent?: boolean; signal?: AbortSignal }): Promise<() => void>;
};

export function createLimiter(limit: number): Limiter {
	// At least one: a limit below that (or NaN) would hand out nothing, ever,
	// and every upload sharing the limiter would wait forever.
	const cap = limit >= 1 ? Math.floor(limit) : 1;
	const waiting: Record<'urgent' | 'normal', Array<() => void>> = { urgent: [], normal: [] };
	let active = 0;

	function next() {
		while (active < cap) {
			const start = waiting.urgent.shift() ?? waiting.normal.shift();
			if (!start) return;
			active += 1;
			start();
		}
	}

	return {
		acquire({ urgent = false, signal } = {}) {
			return new Promise((resolve, reject) => {
				if (signal?.aborted) return reject(signal.reason);
				const lane = waiting[urgent ? 'urgent' : 'normal'];
				const onAbort = () => {
					const index = lane.indexOf(start);
					if (index < 0) return;
					lane.splice(index, 1);
					reject(signal!.reason);
				};
				const start = () => {
					signal?.removeEventListener('abort', onAbort);
					let released = false;
					resolve(() => {
						if (released) return;
						released = true;
						active -= 1;
						next();
					});
				};
				lane.push(start);
				signal?.addEventListener('abort', onAbort, { once: true });
				next();
			});
		}
	};
}

const UNLIMITED: Limiter = {
	async acquire({ signal } = {}) {
		signal?.throwIfAborted();
		return () => {};
	}
};

export type UploadOptions = {
	/**
	 * Full-size image work, one photograph at a time (`createSerialQueue`).
	 * Share one across every upload on the page: a decoded photo holds tens of
	 * megabytes of canvas, and iOS Safari caps the total.
	 */
	heavy: SerialQueue;
	/** Bounds the PUTs in flight across every upload sharing it; unbounded without one. */
	slots?: Limiter;
	onStage?: (stage: UploadStage) => void;
	/** 0–1 over the original's and the display copy's bytes together; never moves back. */
	onProgress?: (fraction: number) => void;
	/** The display copy as soon as it is encoded: a preview any browser can show. */
	onDisplay?: (display: Blob) => void;
	signal?: AbortSignal;
};

/**
 * Upload one photograph: sniff it (an unsupported file is refused before any
 * request), ask for the original's URL and start its PUT at once, make the
 * display copy (decode, downscale to 2560 px, encode WebP) on the `heavy`
 * queue meanwhile, then — once the original has landed — upload the display
 * copy and finalize.
 *
 * Aborting `signal` stops whatever is still running and rejects with the
 * abort reason, except once finalize has been asked: by then the photograph
 * may already exist on the server, so finalize is left to finish and the
 * upload resolves with it, for the caller to delete if it no longer wants it.
 * Objects already PUT but never finalized are swept by the server.
 */
export async function uploadImage(file: File, options: UploadOptions): Promise<UploadedImage> {
	const { heavy, slots = UNLIMITED, onStage, onProgress, onDisplay, signal } = options;

	// Aborted by the caller, or by this upload itself once either of its
	// halves (the original's PUT, the display copy) fails.
	const local = new AbortController();
	const forward = () => local.abort(signal?.reason);
	signal?.addEventListener('abort', forward, { once: true });
	if (signal?.aborted) forward();
	const aborting = local.signal;

	// Callbacks stop once the upload settles or the caller lets go of it; work
	// that can't be interrupted (an encode) may still finish afterwards.
	let settled = false;
	const report = (stage: UploadStage) => {
		if (!settled && !signal?.aborted) onStage?.(stage);
	};
	const progress = byteProgress(file.size, (fraction) => {
		if (!settled && !signal?.aborted) onProgress?.(fraction);
	});

	try {
		report('reading');
		const type = await sniffFile(file);
		if (!type) throw new UploadError(UNSUPPORTED_PHOTO, 415);

		const release = await slots.acquire({ signal: aborting });
		let grant: OriginalUploadGrant;
		try {
			grant = await requestOriginalUpload(file, type, aborting);
		} catch (e) {
			release();
			throw e;
		}

		let originalSent = false;
		let displayMade = false;
		report('uploading');
		const sent = putWithProgress(grant.upload, file, {
			signal: aborting,
			onProgress: progress.original
		})
			.finally(release)
			.then(() => {
				originalSent = true;
				if (!displayMade) report('encoding');
			});
		// Queued only now the original has its URL: a refused upload (locked,
		// too large, over the allowance) costs no encode, and encodes never run
		// far ahead of the uploads, holding finished copies nobody can send yet.
		const made = heavy
			.run(async () => {
				// Removed, or failed, while it waited its turn.
				aborting.throwIfAborted();
				// While the original is still going up, that is what the tile shows
				// (with its progress); the encode is only what it waits on after.
				if (originalSent) report('encoding');
				const canvas = await decodeImage(file, type);
				try {
					return await encodeWebP(canvas);
				} finally {
					releaseCanvas(canvas);
				}
			})
			.then((display) => {
				displayMade = true;
				if (!settled && !aborting.aborted) onDisplay?.(display);
				return display;
			});

		let display: Blob;
		try {
			[, display] = await Promise.all([sent, made]);
		} catch (e) {
			// One half failed: stop the other rather than finish work nobody can use.
			local.abort();
			throw e;
		}

		progress.displaySize(display.size);
		const releaseDisplay = await slots.acquire({ urgent: true, signal: aborting });
		try {
			report('uploading');
			const target = await requestDisplayUpload(grant, display.size, aborting);
			await putWithProgress(target, display, { signal: aborting, onProgress: progress.display });
		} finally {
			releaseDisplay();
		}

		aborting.throwIfAborted();
		report('finalizing');
		// Deliberately not abortable (see above): an abort would only stop us
		// hearing the answer, not the server recording the photograph.
		const uploaded = await finalizeUpload({
			originalKey: grant.originalKey,
			displayKey: grant.displayKey,
			name: file.name
		});
		report('done');
		return uploaded;
	} catch (e) {
		report('error');
		throw e;
	} finally {
		settled = true;
		signal?.removeEventListener('abort', forward);
	}
}

/** Until the display copy is encoded, its size is guessed: about this, or the original's if smaller. */
const DISPLAY_BYTES_ESTIMATE = 800 * 1024;

/**
 * One fraction over both PUTs, weighted by their bytes. The display copy's
 * size is only known once it is encoded, so it starts as an estimate; the
 * fraction never moves backwards when the estimate is corrected.
 */
function byteProgress(originalBytes: number, report: (fraction: number) => void) {
	let original = 0;
	let display = 0;
	let displayBytes = Math.min(originalBytes, DISPLAY_BYTES_ESTIMATE);
	let last = 0;

	const emit = () => {
		const fraction = Math.min(1, (original + display) / Math.max(1, originalBytes + displayBytes));
		if (fraction <= last) return;
		last = fraction;
		report(fraction);
	};

	return {
		original: (loaded: number) => {
			original = Math.min(loaded, originalBytes);
			emit();
		},
		displaySize: (size: number) => {
			displayBytes = size;
			emit();
		},
		display: (loaded: number) => {
			display = Math.min(loaded, displayBytes);
			emit();
		}
	};
}

/** POST JSON to one of the archive's endpoints and read its JSON answer. */
async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal
		});
	} catch {
		// An abort is the caller's own doing, not a connection problem.
		if (signal?.aborted) throw signal.reason;
		throw new UploadError(UNREACHABLE, 0);
	}

	try {
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw serverError(res.status, text, `Upload failed (HTTP ${res.status})`);
		}
		return (await res.json()) as T;
	} catch (e) {
		if (signal?.aborted) throw signal.reason;
		if (e instanceof UploadError) throw e;
		throw new UploadError('The archive sent an answer the uploader did not expect', res.status);
	}
}

/** An `UploadError` carrying the server's own `{ message }` when it sent one. */
function serverError(status: number, text: string, fallback: string): UploadError {
	let parsed: unknown = null;
	try {
		parsed = JSON.parse(text);
	} catch {
		// Not JSON: an HTML error page from a proxy, or the bucket's XML.
	}
	const fields = (typeof parsed === 'object' && parsed ? parsed : {}) as { message?: unknown };
	const message = typeof fields.message === 'string' && fields.message ? fields.message : fallback;
	return new UploadError(message, status, status === 401);
}

/**
 * A failed PUT. The dev proxy and the access gate answer JSON like the rest
 * of the API; the bucket answers S3's XML (`<Error><Code>…</Code>…`), whose
 * code is worth keeping for whoever has to work out what went wrong.
 */
function storageError(status: number, text: string): UploadError {
	const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
	return serverError(
		status,
		text,
		`Storage refused the upload (${code ?? `HTTP ${status}`}). Try again.`
	);
}
