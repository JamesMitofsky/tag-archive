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
 * (scans are capped at 4 MB, under Vercel's 4.5 MB function body limit; see
 * ./limits).
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

/** Extension for each type a canvas can hand back, PNG included for the WebKit case. */
const EXTENSIONS: Record<string, string> = {
	'image/webp': 'webp',
	'image/jpeg': 'jpg',
	'image/png': 'png'
};

/** File extension for `encodedImageType()`, for naming what is uploaded. */
export function encodedExtension(): string {
	return EXTENSIONS[encodedImageType()];
}

/**
 * `name` with its extension (if any) swapped for the one matching `type`, so an
 * upload's name always agrees with the bytes it carries. Types without a known
 * extension leave the name as it is.
 */
export function withExtension(name: string, type: string): string {
	const extension = EXTENSIONS[type];
	return extension ? `${name.replace(/\.[^/.]+$/, '')}.${extension}` : name;
}

/**
 * Longest-edge-capped dimensions, preserving aspect ratio. The short edge is
 * at least 1: a panorama sliver rounded to 0 would leave nothing to encode.
 */
export function fitWithin(
	width: number,
	height: number,
	maxDim: number
): { width: number; height: number } {
	if (width <= maxDim && height <= maxDim) return { width, height };
	const scaled = (edge: number, longest: number) =>
		Math.max(1, Math.round((edge * maxDim) / longest));
	return width > height
		? { width: maxDim, height: scaled(height, width) }
		: { width: scaled(width, height), height: maxDim };
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
	// The default, 'low', aliases fine detail when a large photo shrinks
	// several times over (a 48 MP one is ~3× wider than MAX_DIM).
	ctx.imageSmoothingQuality = 'high';
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

/**
 * Encode a canvas (see `encodedImageType`), capping its longest edge first.
 * Read the result's `type` rather than assuming one. To show the result, make
 * an object URL of the blob rather than encoding a second copy.
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
		// A downscaled copy is ours to free; the caller's canvas is not.
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

/** `turns` as 0–3: any whole number of quarter turns, negative ones included. */
export function quarterTurns(turns: number): 0 | 1 | 2 | 3 {
	return (((Math.round(turns) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}

/**
 * A copy of `source` turned `turns` quarter turns counterclockwise. The
 * transform maps whole pixels onto whole pixels, so nothing is resampled and
 * four turns give back the original exactly. `null` if no 2D context was had.
 */
export function rotateQuarterTurns(
	source: HTMLCanvasElement,
	turns: number
): HTMLCanvasElement | null {
	const quarter = quarterTurns(turns);
	const { width, height } = source;
	const sideways = quarter % 2 === 1;
	const canvas = document.createElement('canvas');
	canvas.width = sideways ? height : width;
	canvas.height = sideways ? width : height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	// Exact integer matrices (x' = a·x + c·y + e, y' = b·x + d·y + f) rather
	// than ctx.rotate, whose cos(π/2) is 6e-17 and not 0.
	if (quarter === 1) ctx.setTransform(0, -1, 1, 0, 0, width);
	else if (quarter === 2) ctx.setTransform(-1, 0, 0, -1, width, height);
	else if (quarter === 3) ctx.setTransform(0, 1, -1, 0, height, 0);
	ctx.drawImage(source, 0, 0);
	return canvas;
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
