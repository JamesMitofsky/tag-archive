import { rgbaToThumbHash, thumbHashToDataURL } from 'thumbhash';

/**
 * A photograph's placeholder: its ThumbHash (https://evanw.github.io/thumbhash/),
 * base64. About 25 bytes that decode to a blurred 32px impression of the
 * photograph (its colors, its light and dark), so a print shows something of
 * itself the moment it is drawn rather than a blank card while its pixels
 * download. Small enough to ride along in the public dataset, so it costs no
 * request of its own.
 *
 * Made in the browser at upload time from the canvas the display copy is
 * encoded from, and checked on the server for being a well-formed hash, but not
 * for matching the photograph: whoever uploads a photograph chooses its pixels
 * anyway, so a placeholder that disagreed with them would cost only a wrong
 * blur for the moment before they load.
 */

/** The largest image ThumbHash encodes; anything bigger is shrunk first. */
const MAX_DIM = 100;

/**
 * The ThumbHash of an RGBA image, base64. Images past MAX_DIM on either side
 * are averaged down to fit first (a box filter, so every source pixel counts).
 * The colors are taken as straight, not premultiplied, alpha.
 */
export function placeholderFromRGBA(
	rgba: ArrayLike<number>,
	width: number,
	height: number
): string {
	const fitted = fit(rgba, width, height);
	return toBase64(rgbaToThumbHash(fitted.width, fitted.height, fitted.rgba));
}

/**
 * The ThumbHash of whatever a canvas holds, base64, or null where the browser
 * won't give its pixels back (a canvas too large for iOS Safari's memory cap,
 * say). Drawn down to MAX_DIM first, so only a few thousand pixels are read.
 */
export function placeholderFromCanvas(
	source: CanvasImageSource & { width: number; height: number }
) {
	try {
		const scale = Math.min(1, MAX_DIM / Math.max(source.width, source.height));
		const width = Math.max(1, Math.round(source.width * scale));
		const height = Math.max(1, Math.round(source.height * scale));
		const small = document.createElement('canvas');
		small.width = width;
		small.height = height;
		const ctx = small.getContext('2d');
		if (!ctx) return null;
		// 'high' has the browser average the pixels it skips, where the default
		// samples a few of them and can land a 4000px photo on unrepresentative ones.
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(source, 0, 0, width, height);
		const { data } = ctx.getImageData(0, 0, width, height);
		small.width = small.height = 0; // let the backing store go at once
		return placeholderFromRGBA(data, width, height);
	} catch {
		return null;
	}
}

/**
 * A placeholder as given, when it is a well-formed ThumbHash: base64 of exactly
 * as many bytes as its own header says it holds. Null otherwise.
 *
 * The decoder never throws: given too few bytes it reads past the end and
 * paints garbage. So the length is checked here, by counting the coefficients
 * its header asks for the same way the decoder does.
 */
export function parsePlaceholder(value: unknown): string | null {
	if (typeof value !== 'string' || value.length > 96) return null;
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
	const bytes = fromBase64(value);
	return bytes.length >= 5 && bytes.length === expectedLength(bytes) ? value : null;
}

/** Decoded placeholders, by hash: a set's prints draw the same photograph more than once. */
const dataUrls = new Map<string, string>();

/**
 * A placeholder as an image URL (a 32px PNG data URL), or null for no or a
 * malformed placeholder. Decoded once per hash.
 */
export function placeholderUrl(hash: string | null | undefined): string | null {
	if (!hash) return null;
	let url = dataUrls.get(hash);
	if (url === undefined) {
		if (!parsePlaceholder(hash)) return null;
		url = thumbHashToDataURL(fromBase64(hash));
		dataUrls.set(hash, url);
	}
	return url;
}

/** How many bytes a ThumbHash with this header holds (mirrors `thumbHashToRGBA`). */
function expectedLength(hash: Uint8Array): number {
	const header24 = hash[0] | (hash[1] << 8) | (hash[2] << 16);
	const header16 = hash[3] | (hash[4] << 8);
	const hasAlpha = (header24 >> 23) & 1;
	const isLandscape = header16 >> 15;
	const lx = Math.max(3, isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7);
	const ly = Math.max(3, isLandscape ? header16 & 7 : hasAlpha ? 5 : 7);
	const coefficients = acCount(lx, ly) + 2 * acCount(3, 3) + (hasAlpha ? acCount(5, 5) : 0);
	return (hasAlpha ? 6 : 5) + Math.ceil(coefficients / 2);
}

/** The varying (AC) terms of one channel: its triangle of DCT terms, less the constant. */
function acCount(nx: number, ny: number): number {
	let n = 0;
	for (let cy = 0; cy < ny; cy++) {
		for (let cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx++) n++;
	}
	return n;
}

/** Shrinks an image to fit MAX_DIM on both sides by averaging, or hands it back as it is. */
function fit(
	rgba: ArrayLike<number>,
	width: number,
	height: number
): { rgba: ArrayLike<number>; width: number; height: number } {
	if (width <= MAX_DIM && height <= MAX_DIM) return { rgba, width, height };
	const scale = MAX_DIM / Math.max(width, height);
	const w = Math.max(1, Math.round(width * scale));
	const h = Math.max(1, Math.round(height * scale));
	const out = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		const y0 = Math.floor((y * height) / h);
		const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / h));
		for (let x = 0; x < w; x++) {
			const x0 = Math.floor((x * width) / w);
			const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / w));
			let r = 0,
				g = 0,
				b = 0,
				a = 0;
			for (let sy = y0; sy < y1; sy++) {
				for (let sx = x0, i = (sy * width + x0) * 4; sx < x1; sx++, i += 4) {
					r += rgba[i];
					g += rgba[i + 1];
					b += rgba[i + 2];
					a += rgba[i + 3];
				}
			}
			const n = (y1 - y0) * (x1 - x0);
			const o = (y * w + x) * 4;
			out[o] = r / n;
			out[o + 1] = g / n;
			out[o + 2] = b / n;
			out[o + 3] = a / n;
		}
	}
	return { rgba: out, width: w, height: h };
}

function toBase64(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
	return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
