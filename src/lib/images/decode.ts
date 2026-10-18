import type { ImageType } from '$lib/imageType';
import { downscale, MAX_DIM } from '$lib/scanner/image';

/** Why a photograph has no display copy, whatever went wrong inside the decoder. */
export const UNREADABLE_PHOTO = 'This photo could not be read in this browser';

/**
 * Longest a HEIC conversion may take: several times what a 48 MP photo needs
 * on a slow phone. libheif runs in a worker that can die (out of memory, say)
 * without ever answering, and the conversion holds the shared image queue
 * (see `uploadImage`), so without a limit every photograph after it would wait
 * forever, and the form with them.
 */
export const HEIC_TIMEOUT_MS = 2 * 60 * 1000;

/** Why a HEIC photo can't be converted once a conversion has timed out. */
export const HEIC_STALLED = 'The HEIC converter stopped responding. Reload the page to try again.';

/**
 * Set once a conversion times out. heic-to runs every conversion through one
 * worker, in turn, for the life of the page: once that worker is dead or
 * stuck, each later conversion would only queue behind it and time out too,
 * two minutes apiece.
 */
let heicStalled = false;

/**
 * Decode a picked photograph into a canvas, upright (its EXIF orientation
 * applied) and no larger than `maxDim` on its longest edge.
 *
 * The browser's own decoder first. A HEIC file it can't decode (every browser
 * but Safari) goes through libheif instead (see ./heic), loaded only then. The
 * caller owns the canvas and should release it (`releaseCanvas`) as soon as it
 * is encoded: iOS Safari caps total canvas memory (see $lib/scanner/image).
 */
export async function decodeImage(
	file: Blob,
	type: ImageType | null,
	maxDim = MAX_DIM
): Promise<HTMLCanvasElement> {
	const native = await decodeToCanvas(file, maxDim);
	if (native) return native;

	if (type === 'image/heic') {
		if (heicStalled) throw new Error(HEIC_STALLED);
		let heic: typeof import('./heic');
		try {
			heic = await import('./heic');
		} catch {
			// The converter is a download of its own: losing the connection while
			// it loads is not the photo's fault, so don't say it is.
			throw new Error('The HEIC converter could not be loaded. Check your connection.');
		}
		let converted: Blob;
		try {
			converted = await withTimeout(heic.heicToJpeg(file), HEIC_TIMEOUT_MS);
		} catch (e) {
			if (e instanceof TimedOut) {
				heicStalled = true;
				throw new Error(HEIC_STALLED, { cause: e });
			}
			throw new Error(UNREADABLE_PHOTO, { cause: e });
		}
		const canvas = await decodeToCanvas(converted, maxDim);
		if (canvas) return canvas;
	}

	throw new Error(UNREADABLE_PHOTO);
}

/** `blob` drawn into a canvas capped at `maxDim`; null when this browser can't decode it. */
async function decodeToCanvas(blob: Blob, maxDim: number): Promise<HTMLCanvasElement | null> {
	const bitmap = await orientedBitmap(blob);
	if (!bitmap) return null;
	try {
		const canvas = downscale(bitmap, bitmap.width, bitmap.height, maxDim);
		// No 2D context: iOS Safari's canvas memory cap, most likely.
		if (!canvas) throw new Error('This photo is too large to prepare in this browser');
		return canvas;
	} finally {
		// The full-size decode is the biggest thing held here (48 MB for a 12 MP
		// photo); free it now rather than whenever it is collected.
		bitmap.close();
	}
}

class TimedOut extends Error {}

/** `promise`, or a `TimedOut` rejection once `ms` pass first. The work itself isn't stopped. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expired = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new TimedOut()), ms);
	});
	return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

async function orientedBitmap(blob: Blob): Promise<ImageBitmap | null> {
	try {
		return await createImageBitmap(blob, { imageOrientation: 'from-image' });
	} catch (e) {
		// An engine that predates the `from-image` value refuses the option
		// itself, as an unknown enum value. Its default is what the spec now
		// calls `from-image`, so decode again without it.
		if (e instanceof TypeError) {
			try {
				return await createImageBitmap(blob);
			} catch {
				return null;
			}
		}
		// Anything else is the image itself: not decodable here.
		return null;
	}
}
