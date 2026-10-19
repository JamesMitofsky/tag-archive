import { json } from '@sveltejs/kit';
import { loadPublicDataset } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

/**
 * The entire public archive dataset as one blob: vetted artefacts, events, and
 * person names (see `loadPublicDataset` for exactly what "vetted" excludes).
 * The dataset is small, so client components fetch this once and search it client-side.
 *
 * Cached in Vercel's CDN with a single `archive` tag; every keeper write purges
 * that tag (see `$lib/server/cache`). The day-long lifetime is a self-healing
 * backstop in case a purge is ever missed — freshness normally comes from the
 * purge, not the TTL. `Vercel-CDN-Cache-Control` speaks to Vercel's CDN alone,
 * so browsers never keep a copy a purge can't reach. The access gate runs in
 * front of this cache (middleware.ts), so a cached copy is still only served to a
 * visitor with a pass.
 */
const CACHE_HEADERS = {
	'Vercel-CDN-Cache-Control': 'max-age=86400, stale-while-revalidate=604800',
	'Vercel-Cache-Tag': 'archive'
};

export const GET: RequestHandler = async () => {
	return json(await loadPublicDataset(), { headers: CACHE_HEADERS });
};
