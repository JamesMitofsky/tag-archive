import { browser } from '$app/env';
import type { CornerPoints } from './detect';
import { releaseCanvas } from './image';
import { quadFromMask } from './outline';
import { MASK_SIZE, type SegmentReply, type SegmentRequest } from './segment.protocol';

/**
 * Page detection by segmentation: a small neural network (U²-Netp, see
 * ./models) marks which pixels of the photo belong to its subject, and
 * outline.ts turns that mask into four corners.
 *
 * Why not edges? An edge detector finds every brightness step in the photo
 * and then has to guess which four belong to the page. A keyboard behind the
 * page, a crease across it or a shadow beside it all offer steps as strong as
 * the page's own, and the guess goes to whichever happen to form the biggest
 * closed shape. The network answers a different question, "what is this a
 * photo of?", which does not depend on the page's edge being the strongest
 * line in the frame.
 *
 * The model (4.6 MB) and its runtime (ONNX Runtime's WebAssembly build, about
 * 3.8 MB gzipped) load on first use, in a worker, and the browser caches
 * both. Everything here is best-effort: any failure reports `unavailable`,
 * and detect.ts falls back to the edge detector.
 */

export type Segmented =
	/** The model ran and found a four-sided subject. */
	| { status: 'found'; corners: CornerPoints }
	/** The model ran and found nothing to crop to. */
	| { status: 'none' }
	/** The model could not be run (not loaded yet, unsupported, crashed). */
	| { status: 'unavailable' };

/**
 * Longest a photo waits for an answer. The first photo's wait includes the
 * download; past this, on a slow connection, it is better to fall back than
 * to keep the review waiting. The download carries on for the next photo.
 */
const TIMEOUT_MS = 12_000;

type Pending = { resolve: (reply: SegmentReply) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function drop(reason: string) {
	worker?.terminate();
	worker = null;
	for (const [id, { resolve }] of pending) resolve({ id, ok: false, error: reason });
	pending.clear();
}

function getWorker(): Worker | null {
	if (!browser || typeof Worker === 'undefined') return null;
	if (worker) return worker;
	try {
		worker = new Worker(new URL('./segment.worker.ts', import.meta.url), { type: 'module' });
	} catch {
		return null;
	}
	worker.onmessage = (event: MessageEvent<SegmentReply>) => {
		pending.get(event.data.id)?.resolve(event.data);
		pending.delete(event.data.id);
	};
	// The worker script itself failed (blocked, out of memory). Start afresh
	// next time rather than leave every later photo waiting on a dead worker.
	worker.onerror = () => drop('worker failed');
	return worker;
}

function request(rgba?: Uint8ClampedArray, timeoutMs?: number): Promise<SegmentReply> {
	const target = getWorker();
	const id = nextId++;
	if (!target) return Promise.resolve({ id, ok: false, error: 'no worker' });

	return new Promise((resolve) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const settle = (reply: SegmentReply) => {
			clearTimeout(timer);
			resolve(reply);
		};
		pending.set(id, { resolve: settle });
		if (timeoutMs) {
			timer = setTimeout(() => {
				// Stop waiting, but leave the worker to finish loading.
				pending.delete(id);
				resolve({ id, ok: false, error: 'timed out' });
			}, timeoutMs);
		}
		const message: SegmentRequest = { id, rgba };
		target.postMessage(message, rgba ? [rgba.buffer] : []);
	});
}

/** Start fetching the model and runtime, so the first photo doesn't wait for them. */
export function warmSegmenter(): void {
	void request();
}

/** `source` squashed to the square the model reads, as RGBA. */
function modelInput(source: HTMLCanvasElement): Uint8ClampedArray | null {
	const canvas = document.createElement('canvas');
	canvas.width = MASK_SIZE;
	canvas.height = MASK_SIZE;
	try {
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return null;
		// A photo shrinks 6–8× here; the default, 'low', would alias its edges.
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(source, 0, 0, MASK_SIZE, MASK_SIZE);
		return ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
	} finally {
		releaseCanvas(canvas);
	}
}

/** Find the subject of `source` and the quad around it, in `source`'s pixels. */
export async function segmentCorners(source: HTMLCanvasElement): Promise<Segmented> {
	if (!browser || source.width <= 0 || source.height <= 0) return { status: 'unavailable' };

	try {
		const rgba = modelInput(source);
		if (!rgba) return { status: 'unavailable' };
		const reply = await request(rgba, TIMEOUT_MS);
		if (!reply.ok || !reply.mask) return { status: 'unavailable' };

		const corners = quadFromMask(
			{ width: MASK_SIZE, height: MASK_SIZE, data: reply.mask },
			source.width,
			source.height
		);
		return corners ? { status: 'found', corners } : { status: 'none' };
	} catch {
		return { status: 'unavailable' };
	}
}
