/**
 * Pixel dimensions of a WebP, read from its first chunk header — enough to
 * record a display copy's size without decoding it (and without a native image
 * library in the function bundle). Handles the three bitstream layouts:
 *
 *  - `VP8 `: lossy, dimensions in the key frame header;
 *  - `VP8L`: lossless, 14-bit dimensions packed after the signature byte;
 *  - `VP8X`: extended (alpha, animation, metadata), 24-bit canvas size.
 *
 * Null for anything that isn't a well-formed WebP header. Needs the first 30 bytes.
 */
export function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
	if (bytes.length < 30) return null;
	const ascii = (start: number, length: number) =>
		String.fromCharCode(...bytes.subarray(start, start + length));
	if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return null;

	const b = bytes;
	let width: number;
	let height: number;
	switch (ascii(12, 4)) {
		case 'VP8 ': {
			// Frame tag (3 bytes, bit 0 clear on a key frame), then the start code.
			if ((b[20] & 1) !== 0 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
			width = (b[26] | (b[27] << 8)) & 0x3fff;
			height = (b[28] | (b[29] << 8)) & 0x3fff;
			break;
		}
		case 'VP8L': {
			if (b[20] !== 0x2f) return null;
			const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
			width = (bits & 0x3fff) + 1;
			height = ((bits >>> 14) & 0x3fff) + 1;
			break;
		}
		case 'VP8X': {
			width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
			height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
			break;
		}
		default:
			return null;
	}
	return width > 0 && height > 0 ? { width, height } : null;
}
