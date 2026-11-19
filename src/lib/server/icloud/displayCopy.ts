import { ENCODE_QUALITY } from '$lib/scanner/image';
import { MAX_DISPLAY_DIM } from '../imageUploads';

/**
 * The WebP display copy of a copied photograph, made on the machine running
 * the sync — the server-side twin of what the browser makes for an upload
 * ($lib/images/encode): EXIF orientation applied, at most MAX_DISPLAY_DIM on
 * its longest edge, the uploader's quality, and no metadata at all (sharp
 * writes none unless asked, so neither EXIF nor XMP reaches the public copy;
 * finalize checks that again).
 *
 * sharp is a devDependency: only this script uses it, never a deployed
 * function. Loaded lazily so nothing else pays for the native module.
 */
export async function displayCopy(original: Uint8Array): Promise<Uint8Array> {
	const { default: sharp } = await import('sharp');
	const webp = await sharp(original, { failOn: 'error' })
		.rotate()
		.resize(MAX_DISPLAY_DIM, MAX_DISPLAY_DIM, { fit: 'inside', withoutEnlargement: true })
		.webp({ quality: Math.round(ENCODE_QUALITY * 100) })
		.toBuffer();
	return new Uint8Array(webp.buffer, webp.byteOffset, webp.byteLength);
}
