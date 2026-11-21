import { ARCHIVE_CACHE_HEADERS } from '#lib/server/cache.ts';
import { loadLiveArrivals } from '#lib/server/db/queries.ts';
import { LIVE_FEED_SIZE } from '#lib/live.ts';
import type { RequestHandler } from './$types';

/**
 * The /live feed: the artefacts that most recently went public, newest first
 * (see `loadLiveArrivals`). The page polls this every LIVE_POLL_MS for as long
 * as it is on screen, so it is a handful of rows rather than the whole dataset.
 *
 * Polled, not pushed: a stream would hold a serverless function open for every
 * watching screen, billed for the whole time it waits. Instead this rides the
 * same CDN cache as /api/dataset, under the `archive` tag that every keeper
 * write purges, so each poll between arrivals is a cache hit and the first poll
 * after one gets the fresh feed. It takes no query parameters on purpose: every
 * viewer shares the one cached copy.
 *
 * Gated like every other /api path: middleware.ts and hooks.server.ts refuse a
 * caller without a pass, before the cache.
 */
export const GET: RequestHandler = async () => {
	return Response.json(await loadLiveArrivals(LIVE_FEED_SIZE), { headers: ARCHIVE_CACHE_HEADERS });
};
