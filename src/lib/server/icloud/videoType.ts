import { sniffImageType } from '$lib/imageType';

/**
 * An ISO-BMFF video's type from its `ftyp` box; null for anything else. HEIC
 * stills share the container, so a file that sniffs as an image is refused
 * rather than stored as a video.
 */
export function sniffVideoType(bytes: Uint8Array): 'video/mp4' | 'video/quicktime' | null {
	if (bytes.length < 12 || sniffImageType(bytes)) return null;
	const ascii = (start: number) => String.fromCharCode(...bytes.subarray(start, start + 4));
	if (ascii(4) !== 'ftyp') return null;
	return ascii(8) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
}
