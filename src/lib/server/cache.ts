import { building, dev } from '$app/environment';

/**
 * Invalidate the public archive dataset at Netlify's edge.
 *
 * The public search pages ship one cached blob (`/api/dataset`, tagged `archive`)
 * and filter it client-side. Any keeper write changes that blob, so every mutation
 * calls this to purge the tag — the next visitor then fetches a fresh copy. One
 * coarse tag covers everything (cross-entity cascades and all), so a write can
 * never under-invalidate.
 *
 * Robustness: a failed purge must NEVER break the write it follows. Worst case the
 * blob serves stale until its `s-maxage` backstop expires (see the dataset route).
 * So this swallows errors and no-ops anywhere there's no Netlify CDN to purge
 * (local `pnpm dev` and the build step).
 */
export async function purgeArchiveCache(): Promise<void> {
	// No CDN to purge during build or local dev — skip so writes don't error there.
	if (building || dev) return;

	try {
		// Imported lazily so the dependency only loads in the Netlify runtime.
		const { purgeCache } = await import('@netlify/functions');
		await purgeCache({ tags: ['archive'] });
	} catch (err) {
		console.error('[cache] purgeArchiveCache failed', err);
	}
}
