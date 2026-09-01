import type { PdfImage } from './pdf';

// Fetches a stored scan as bytes a PDF can embed.
//
// Scans land in R2 in whatever format the uploader produced — PageScanner captures are
// `image/webp`, and heic/gif are accepted too — but pdf-lib embeds JPEG and PNG only.
// The Netlify Image CDN is the transcoder: the same `/.netlify/images` endpoint
// OptimizedImage.svelte already uses, here pinned to `fm=jpg` so the answer is always
// embeddable.
//
// The parameters below are deliberately NOT the ones OptimizedImage uses. That component
// optimises for the screen — it resizes down to the displayed width and lets the CDN
// negotiate webp/avif, because bytes on the wire are what matter there. A PDF is the
// opposite job: it is the copy someone keeps and prints, so it takes the scan at the
// resolution it was stored at. Sending web-sized images into the PDF was costing roughly
// a third of the archive's resolution (see MAX_WIDTH).
//
// `encodeURIComponent` on the `url` param for the same reason as OptimizedImage: the
// seed archive's filenames contain spaces, which must arrive as %20 (a `+` is read
// literally by the CDN and 404s).

/**
 * Ceiling, not a target. Matches MAX_DIM in $lib/scanner/image, the longest edge a
 * capture is stored at, and clears the 2550px seed scans — so nothing in the archive is
 * downscaled today and an oversized future upload still can't run away with the
 * function's memory. The CDN does not upscale (a 1167px scan asked for at 2560 comes
 * back 1167px), so small scans pass through untouched.
 *
 * For scale: a 2550px scan fills A4's 7.6in printable width at ~335 dpi, past the 300
 * dpi print standard. The previous web-shaped 1600 put the same page at ~210 dpi.
 */
const MAX_WIDTH = 2560;

/**
 * Matched to WEBP_QUALITY (0.85), the quality the master was stored at. Going higher is
 * counterproductive: at q90 the JPEG comes back larger than the WebP it was decoded from,
 * which is the encoder spending bytes to preserve that file's compression artefacts
 * rather than any detail from the document.
 */
const QUALITY = 85;

/** Content types pdf-lib can take as-is, mapped to the embed call to use. */
const DIRECT_TYPES: Record<string, PdfImage['type']> = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png'
};

/**
 * Returns the image as JPEG (or PNG, on the dev fallback path), or `null` when it
 * cannot be made embeddable.
 *
 * `origin` is the running site's origin — the Image CDN lives on it. Under plain
 * `vite dev` there is no `/.netlify/images`, so this falls back to fetching the R2 URL
 * directly and only accepts it when it is already a JPEG or PNG; a dev webp scan
 * yields `null` rather than a corrupt page.
 */
export async function fetchNormalizedImage(url: string, origin: string): Promise<PdfImage | null> {
	const cdnUrl = `${origin}/.netlify/images?url=${encodeURIComponent(url)}&w=${MAX_WIDTH}&q=${QUALITY}&fm=jpg`;

	const viaCdn = await safeFetch(cdnUrl);
	if (viaCdn?.ok) {
		return { bytes: new Uint8Array(await viaCdn.arrayBuffer()), type: 'jpg' };
	}

	const direct = await safeFetch(url);
	if (!direct?.ok) return null;

	const contentType = (direct.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	const type = DIRECT_TYPES[contentType];
	if (!type) return null;

	return { bytes: new Uint8Array(await direct.arrayBuffer()), type };
}

/** A transport failure is just "no image" here — one bad scan shouldn't 500 the download. */
async function safeFetch(url: string): Promise<Response | null> {
	try {
		return await fetch(url);
	} catch {
		return null;
	}
}
