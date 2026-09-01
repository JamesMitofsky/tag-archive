/** Canvas/WebP plumbing shared by the camera path, the file-input path and the crop editor. */

export const MAX_DIM = 2560;
export const WEBP_QUALITY = 0.85;

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

/** Encode a canvas as WebP, capping its longest edge first. */
export async function canvasToWebP(
	canvas: HTMLCanvasElement,
	maxDim = MAX_DIM,
	quality = WEBP_QUALITY
): Promise<{ blob: Blob; previewUrl: string } | null> {
	const sized =
		canvas.width > maxDim || canvas.height > maxDim
			? downscale(canvas, canvas.width, canvas.height, maxDim)
			: canvas;
	if (!sized) return null;

	const blob = await new Promise<Blob | null>((resolve) =>
		sized.toBlob(resolve, 'image/webp', quality)
	);
	if (!blob) return null;

	return { blob, previewUrl: sized.toDataURL('image/webp', quality) };
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
