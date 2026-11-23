import { sniffImageType, type ImageType } from '#lib/imageType.ts';
import { releaseCanvas } from '#lib/scanner/image.ts';
import type { SerialQueue } from '#lib/scanner/serial.ts';
import { decodeImage } from './decode';
import { encodeWebP } from './encode';
import { placeholderFromCanvas } from './placeholder';
import type {
	DisplayUploadGrant,
	DisplayUploadRequest,
	FinalizeRequest,
	OriginalUploadGrant,
	OriginalUploadRequest,
	PresignedPut,
	UploadedImage
} from './types';
import {
	postJson,
	putWithProgress,
	UNLIMITED,
	UploadError,
	type Limiter
} from '#lib/uploads/transfer.ts';

// The transport lives in #lib/uploads/transfer, shared with the track
// uploader; re-exported so this stays the photograph uploader's one import.
export {
	createLimiter,
	putWithProgress,
	STALL_MS,
	UploadError,
	type Limiter
} from '#lib/uploads/transfer.ts';

/**
 * The browser side of uploading one photograph (see #lib/server/imageUploads
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

/** Refusal for a file whose bytes aren't one of the types the archive takes. */
export const UNSUPPORTED_PHOTO = 'Not a JPEG, PNG, WebP, GIF or HEIC photograph';

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
					// From the same pixels as the display copy, while they are at hand.
					const placeholder = placeholderFromCanvas(canvas);
					return { display: await encodeWebP(canvas), placeholder };
				} finally {
					releaseCanvas(canvas);
				}
			})
			.then((made) => {
				displayMade = true;
				if (!settled && !aborting.aborted) onDisplay?.(made.display);
				return made;
			});

		let display: Blob;
		let placeholder: string | null;
		try {
			[, { display, placeholder }] = await Promise.all([sent, made]);
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
			name: file.name,
			placeholder
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
