import { building, dev } from '$app/env';

/**
 * Response headers for a public read that is a slice of the archive: cached in
 * Vercel's CDN under the one `archive` tag `purgeArchiveCache` drops, so a keeper
 * write refreshes every such response at once. The day-long lifetime is a
 * self-healing backstop in case a purge is ever missed; freshness normally comes
 * from the purge, not the TTL. `Vercel-CDN-Cache-Control` speaks to Vercel's CDN
 * alone, so browsers never keep a copy a purge can't reach. The access gate runs
 * in front of this cache (middleware.ts), so a cached copy is still only served
 * to a visitor with a pass.
 */
export const ARCHIVE_CACHE_HEADERS = {
	'Vercel-CDN-Cache-Control': 'max-age=86400, stale-while-revalidate=604800',
	'Vercel-Cache-Tag': 'archive'
} as const;

/**
 * Invalidate the public archive dataset in Vercel's CDN cache.
 *
 * The public search pages ship one cached blob (`/api/dataset`, tagged `archive`)
 * and filter it client-side, and /live polls a cached feed (`/api/live`) under
 * the same tag. Any keeper write changes that blob, so every mutation
 * calls this to drop the tag — the next visitor then fetches a fresh copy. One
 * coarse tag covers everything (cross-entity cascades and all), so a write can
 * never under-invalidate.
 *
 * Deleted rather than invalidated: an invalidated entry is served stale once more
 * while it refreshes in the background, so the keeper who just saved would see
 * the old archive on their next look. The stampede a delete can cause is no worry
 * at this site's traffic.
 *
 * Robustness: a failed purge must NEVER break the write it follows. Worst case the
 * blob serves stale until its cache lifetime runs out (see the dataset route).
 * So this swallows errors, and it no-ops wherever there's no Vercel CDN to purge:
 * local `pnpm dev` and the build step skip it here, and outside a Vercel request
 * `@vercel/functions` resolves without doing anything.
 */
export async function purgeArchiveCache(): Promise<void> {
	// No CDN to purge during build or local dev — skip so writes don't error there.
	if (building || dev) return;

	try {
		// Imported lazily so the dependency only loads where a purge can happen.
		const { dangerouslyDeleteByTag } = await import('@vercel/functions');
		await dangerouslyDeleteByTag('archive');
	} catch (err) {
		console.error('[cache] purgeArchiveCache failed', err);
	}
}
