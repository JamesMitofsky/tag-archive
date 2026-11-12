import { building, dev } from '$app/environment';

/**
 * Invalidate the public archive dataset in Vercel's CDN cache.
 *
 * The public search pages ship one cached blob (`/api/dataset`, tagged `archive`)
 * and filter it client-side. Any keeper write changes that blob, so every mutation
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
