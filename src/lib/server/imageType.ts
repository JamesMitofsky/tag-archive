/**
 * Identify an uploaded image by its leading bytes — never by the client's
 * declared `Content-Type`, which is whatever the sender says it is. The bucket
 * serves objects publicly with the type stored at upload, so trusting the
 * declared type would let anyone host, say, an `image/svg+xml` file carrying
 * script.
 *
 * Covers exactly what the scanner sends: WebP (everything it can decode and
 * re-encode) plus the raw formats it forwards untouched when the browser can't
 * decode them (HEIC/HEIF from iPhones), and the common camera formats.
 */
export type ImageType = 'image/webp' | 'image/jpeg' | 'image/png' | 'image/gif' | 'image/heic';

const ascii = (bytes: Uint8Array, start: number, length: number) =>
	String.fromCharCode(...bytes.subarray(start, start + length));

/** ISO-BMFF brands that mean HEIC/HEIF still images. */
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

export function sniffImageType(bytes: Uint8Array): ImageType | null {
	if (bytes.length < 12) return null;
	if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
	if (
		bytes[0] === 0x89 &&
		ascii(bytes, 1, 3) === 'PNG' &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return 'image/png';
	}
	if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return 'image/gif';
	if (ascii(bytes, 4, 4) === 'ftyp' && HEIF_BRANDS.has(ascii(bytes, 8, 4))) return 'image/heic';
	return null;
}
