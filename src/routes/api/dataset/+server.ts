import { json } from '@sveltejs/kit';
import { loadPublicDataset } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

/**
 * The entire public archive dataset as one blob: vetted artefacts, events, and
 * person names (see `loadPublicDataset` for exactly what "vetted" excludes).
 * The dataset is small, so client components fetch this once and search it client-side.
 *
 * Cached at Netlify's edge with a single `archive` tag; every keeper write purges
 * that tag (see `$lib/server/cache`). `s-maxage` is a self-healing backstop in case
 * a purge is ever missed — freshness normally comes from the purge, not the TTL.
 */
const CACHE_HEADERS = {
	'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400, stale-while-revalidate=604800',
	'Netlify-Cache-Tag': 'archive'
};

export const GET: RequestHandler = async () => {
	return json(await loadPublicDataset(), { headers: CACHE_HEADERS });
};
