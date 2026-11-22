import { error } from '@sveltejs/kit';
import { normalizeContentQuery } from '#lib/images/cards.ts';
import { ARCHIVE_CACHE_HEADERS } from '#lib/server/cache.ts';
import { searchByContent } from '#lib/server/contentSearch.ts';
import { MAX_QUERY_LENGTH } from '#lib/server/imageEmbeddings.ts';
import type { RequestHandler } from './$types';

/**
 * The photographs of vetted sets that show what `q` names ("flower", "a
 * painted wall"), best first, as `[{ id, score }]` (see
 * #lib/server/contentSearch). /images joins the ids with the photographs it
 * already holds from /api/dataset, so only ids leave here, never anything of
 * a set still in review.
 *
 * Cached in Vercel's CDN like the dataset, under the same `archive` tag
 * (`ARCHIVE_CACHE_HEADERS`): a query asked before answers from the cache, and
 * any keeper write, or the nightly embedding catch-up, drops every cached
 * answer at once. Behind the access gate like every other archive read
 * (middleware.ts). The query is normalized before the lookup's key is fixed,
 * so "Flower " and "flower" share one cached answer: the client sends it
 * that way, and anything else is refused rather than cached a second time.
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	if (!q || q.length > MAX_QUERY_LENGTH) throw error(400, 'Expected a query');
	if (q !== normalizeContentQuery(q)) throw error(400, 'Expected a normalized query');

	try {
		return Response.json(await searchByContent(q), { headers: ARCHIVE_CACHE_HEADERS });
	} catch (e) {
		// The page falls back to searching by words alone. Not cached: the next
		// asker gets a fresh attempt.
		console.error('[content-search] search failed', e);
		throw error(502, 'Content search is unavailable');
	}
};
