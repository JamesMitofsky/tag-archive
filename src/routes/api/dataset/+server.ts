import { ARCHIVE_CACHE_HEADERS } from '#lib/server/cache.ts';
import { loadPublicDataset } from '#lib/server/db/queries.ts';
import type { RequestHandler } from './$types';

/**
 * The entire public archive dataset as one blob: vetted artefacts and image
 * sets, every event, and person names (see `loadPublicDataset` for exactly
 * what it leaves out).
 * The dataset is small, so client components fetch this once and search it client-side.
 *
 * Cached in Vercel's CDN under the `archive` tag every keeper write purges (see
 * `ARCHIVE_CACHE_HEADERS` in `#lib/server/cache.ts` for the lifetime and why).
 */
export const GET: RequestHandler = async () => {
	return Response.json(await loadPublicDataset(), { headers: ARCHIVE_CACHE_HEADERS });
};
