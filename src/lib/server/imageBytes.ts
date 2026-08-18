import type { PdfImage } from './pdf';

// Fetches a stored scan as bytes a PDF can embed.
//
// Scans land in R2 in whatever format the uploader produced — PageScanner captures are
// `image/webp`, and heic/gif are accepted too — but pdf-lib embeds JPEG and PNG only.
// The Netlify Image CDN is the transcoder: the same `/.netlify/images` endpoint
// OptimizedImage.svelte already uses, here pinned to `fm=jpg` so the answer is always
// embeddable, and capped at 1600px so a 50-scan artefact can't blow the function's
// memory or the response size.
//
// `encodeURIComponent` on the `url` param for the same reason as OptimizedImage: the
// seed archive's filenames contain spaces, which must arrive as %20 (a `+` is read
// literally by the CDN and 404s).

const MAX_WIDTH = 1600;
const QUALITY = 75;

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
