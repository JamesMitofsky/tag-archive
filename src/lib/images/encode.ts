import { sniffImageType } from '$lib/imageType';
import { ENCODE_QUALITY, encodedImageType } from '$lib/scanner/image';

/** Why a photograph has no display copy when its pixels were fine. */
export const UNENCODABLE_PHOTO = 'This photo could not be converted in this browser';

/**
 * Encode a canvas as a WebP display copy: the only format the archive shows
 * photographs in, and the only one finalize accepts for a display object.
 *
 * The canvas's own encoder where it has one. Safari has none, and asking it
 * for WebP quietly returns a PNG instead (see `encodedImageType`), so there —
 * and wherever the native result turns out not to be WebP after all — a
 * WebAssembly build of libwebp does it, loaded only then.
 *
 * The result is checked before it goes anywhere, so a non-WebP display copy
 * is never uploaded. A canvas carries no metadata, so neither does this.
 */
export async function encodeWebP(
	canvas: HTMLCanvasElement,
	quality = ENCODE_QUALITY
): Promise<Blob> {
	// Nothing to encode: a released canvas (see `releaseCanvas`). Neither
	// encoder makes a WebP of it (the native one hands back null, libwebp's
	// pixels can't even be read).
	if (canvas.width === 0 || canvas.height === 0) throw new Error(UNENCODABLE_PHOTO);
	const q = Number.isFinite(quality) ? Math.min(Math.max(quality, 0), 1) : ENCODE_QUALITY;

	if (encodedImageType() === 'image/webp') {
		const native = await nativeWebP(canvas, q);
		if (native && (await isWebP(native))) return native;
	}
	const encoded = await wasmWebP(canvas, q);
	if (!(await isWebP(encoded))) throw new Error(UNENCODABLE_PHOTO);
	return encoded;
}

function nativeWebP(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

/** libwebp's WebAssembly, once loading it has started; cleared if it fails. */
let libwebpReady: Promise<unknown> | undefined;

/** `quality` is 0–1, already clamped. */
async function wasmWebP(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
	let encode: typeof import('@jsquash/webp/encode').default;
	try {
		const libwebp = await import('@jsquash/webp/encode');
		// The .wasm is a download of its own, which `encode` would start on first
		// use: a failure there would be blamed on the photo, and libwebp keeps a
		// failed load for the page's life. Calling `init` again starts it afresh.
		libwebpReady ??= libwebp.init().catch((error: unknown) => {
			libwebpReady = undefined;
			throw error;
		});
		await libwebpReady;
		encode = libwebp.default;
	} catch {
		// Downloads of their own: a lost connection, not the photo's fault.
		throw new Error('The WebP converter could not be loaded. Check your connection.');
	}

	try {
		// Read the pixels only once the encoder is here, so they aren't held while it loads.
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('No 2D context');
		const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
		// libwebp's quality is 0–100 where the canvas's is 0–1.
		const bytes = await encode(pixels, { quality: Math.round(quality * 100) });
		return new Blob([bytes], { type: 'image/webp' });
	} catch {
		// No context or no memory for the pixels (iOS Safari's canvas cap), or libwebp refused.
		throw new Error(UNENCODABLE_PHOTO);
	}
}

/**
 * Whether `blob` is a whole WebP file: the RIFF/WEBP signature, and a RIFF
 * size that accounts for every byte. The server checks the signature and the
 * dimensions; the size check catches a buffer handed back with slack around
 * the image, which would otherwise be uploaded as is.
 */
async function isWebP(blob: Blob): Promise<boolean> {
	const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
	if (sniffImageType(head) !== 'image/webp') return false;
	const riffSize = new DataView(head.buffer).getUint32(4, true);
	return riffSize + 8 === blob.size;
}
