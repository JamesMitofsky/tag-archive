import { heicTo } from 'heic-to';

/**
 * Convert a HEIC/HEIF still into a JPEG any browser can decode.
 *
 * Only Safari decodes HEIC natively, and iPhones shoot it by default, so the
 * other browsers need libheif. heic-to bundles it into a 3 MB module, which
 * is why this file exists on its own: `$lib/images/decode` imports it
 * dynamically, only once a HEIC file has failed to decode natively.
 *
 * libheif applies the file's rotation and mirroring (`irot`/`imir`) while
 * decoding, and the JPEG a canvas encodes carries no orientation tag, so the
 * result comes out upright with nothing left to rotate. The JPEG is only an
 * intermediate, downscaled and re-encoded as WebP next, so it is kept at high
 * quality: its loss shouldn't add to the display copy's.
 */
export function heicToJpeg(file: Blob): Promise<Blob> {
	return heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
}
