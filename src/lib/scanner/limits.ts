/**
 * The largest scan `/api/scans` takes. Scans are posted through a Vercel
 * Function, whose request body caps at 4.5 MB; a body past that never reaches
 * the route, and the browser gets the platform's own 413 page instead of a
 * message. So the route refuses at 4 MB, leaving room for the multipart
 * framing, and the scanner checks the size before it posts at all.
 *
 * The scanner's own encodes stay far below this (a 2560 px JPEG or WebP is
 * 1–2 MB). What can reach it is a photo the browser couldn't decode, such as a
 * HEIC on Chrome, which goes up untouched.
 */
export const MAX_SCAN_BYTES = 4 * 1024 * 1024;

/** The refusal both sides give for a scan over MAX_SCAN_BYTES. */
export const SCAN_TOO_LARGE =
	'This image is over 4 MB. Try a smaller copy, or a JPEG instead of HEIC.';
