/** Canvas/encoding plumbing shared by the camera path, the file-input path and the crop editor. */

export const MAX_DIM = 2560;
export const ENCODE_QUALITY = 0.85;

export type EncodedType = 'image/webp' | 'image/jpeg';

let encodedType: EncodedType | undefined;

/**
 * The format every image the scanner produces is encoded in: WebP where the
 * browser can encode it, JPEG where it can't. Safari (through at least 26)
 * can't, and `toBlob` doesn't fail when asked: it silently hands back a PNG,
 * 4–10 MB for one 2560px photo, which is past what an upload can carry
 * (Netlify's function body limit is 6 MB, ~4.5 MB once binary is base64'd).
 * The same photo as JPEG is 1–2 MB and encodes several times faster.
 */
export function encodedImageType(): EncodedType {
	if (!encodedType) {
		const probe = document.createElement('canvas');
		probe.width = 1;
		probe.height = 1;
		encodedType = probe.toDataURL('image/webp').startsWith('data:image/webp')
			? 'image/webp'
			: 'image/jpeg';
		releaseCanvas(probe);
	}
	return encodedType;
}

/** File extension for `encodedImageType()`, for naming what is uploaded. */
export function encodedExtension(): string {
	return encodedImageType() === 'image/webp' ? 'webp' : 'jpg';
}

/** Longest-edge-capped dimensions, preserving aspect ratio. */
export function fitWithin(
	width: number,
	height: number,
	maxDim: number
): { width: number; height: number } {
	if (width <= maxDim && height <= maxDim) return { width, height };
	return width > height
		? { width: maxDim, height: Math.round((height * maxDim) / width) }
		: { width: Math.round((width * maxDim) / height), height: maxDim };
}

/** Draw `source` into a new canvas, scaled down to `maxDim` on its longest edge. */
export function downscale(
	source: CanvasImageSource,
	sourceWidth: number,
	sourceHeight: number,
	maxDim = MAX_DIM
): HTMLCanvasElement | null {
	const { width, height } = fitWithin(sourceWidth, sourceHeight, maxDim);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.drawImage(source, 0, 0, width, height);
	return canvas;
}

function capped(canvas: HTMLCanvasElement, maxDim: number): HTMLCanvasElement | null {
	return canvas.width > maxDim || canvas.height > maxDim
		? downscale(canvas, canvas.width, canvas.height, maxDim)
		: canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, encodedImageType(), quality));
}

/** Encode a canvas (see `encodedImageType`), capping its longest edge first. */
export async function encodeImageWithPreview(
	canvas: HTMLCanvasElement,
	maxDim = MAX_DIM,
	quality = ENCODE_QUALITY
): Promise<{ blob: Blob; previewUrl: string } | null> {
	const sized = capped(canvas, maxDim);
	if (!sized) return null;

	try {
		const blob = await toBlob(sized, quality);
		if (!blob) return null;
		return { blob, previewUrl: sized.toDataURL(encodedImageType(), quality) };
	} finally {
		// A downscaled copy is ours to free; the caller's canvas is not.
		if (sized !== canvas) releaseCanvas(sized);
	}
}

/**
 * `encodeImageWithPreview` without the data URL, for images that are kept but
 * never shown as-is (the un-cropped original). Saves a second, synchronous encode.
 */
export async function encodeImage(
	canvas: HTMLCanvasElement,
	maxDim = MAX_DIM,
	quality = ENCODE_QUALITY
): Promise<Blob | null> {
	const sized = capped(canvas, maxDim);
	if (!sized) return null;

	try {
		return await toBlob(sized, quality);
	} finally {
		if (sized !== canvas) releaseCanvas(sized);
	}
}

/**
 * Free a canvas's pixels now rather than whenever it is collected. iOS Safari
 * caps total canvas memory and counts a canvas until it is garbage collected,
 * so a run of full-size photos can exhaust it unless each is released.
 */
export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined) {
	if (!canvas) return;
	canvas.width = 0;
	canvas.height = 0;
}

/** Decode a File/Blob into a canvas, capped at `maxDim`. `null` if it can't be decoded. */
export async function fileToCanvas(
	file: Blob,
	maxDim = MAX_DIM
): Promise<HTMLCanvasElement | null> {
	try {
		const bitmap = await createImageBitmap(file);
		const canvas = downscale(bitmap, bitmap.width, bitmap.height, maxDim);
		bitmap.close();
		return canvas;
	} catch {
		return null;
	}
}

/** Snapshot a canvas so the un-cropped original survives for later re-cropping. */
export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement | null {
	const canvas = document.createElement('canvas');
	canvas.width = source.width;
	canvas.height = source.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.drawImage(source, 0, 0);
	return canvas;
}
