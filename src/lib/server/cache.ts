import { building, dev } from '$app/environment';

/**
 * Edge-cache headers for any public, read-only view of the archive. Everything
 * carrying these is purged together by `purgeArchiveCache` on every keeper write
 * — the dataset blob and the per-artefact PDFs alike — so a response can never
 * outlive the data it was built from.
 *
 * `s-maxage` is a self-healing backstop in case a purge is ever missed —
 * freshness normally comes from the purge, not the TTL.
 */
export const ARCHIVE_CACHE_HEADERS = {
	'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400, stale-while-revalidate=604800',
	'Netlify-Cache-Tag': 'archive'
} as const;

/**
 * Invalidate the public archive at Netlify's edge.
 *
 * The public search pages ship one cached blob (`/api/dataset`, tagged `archive`)
 * and filter it client-side, and each artefact's compiled PDF is cached under the
 * same tag. Any keeper write changes that data, so every mutation calls this to
 * purge the tag — the next visitor then fetches a fresh copy. One coarse tag
 * covers everything (cross-entity cascades and all), so a write can never
 * under-invalidate.
 *
 * Robustness: a failed purge must NEVER break the write it follows. Worst case the
 * cached responses serve stale until their `s-maxage` backstop expires. So this
 * swallows errors and no-ops anywhere there's no Netlify CDN to purge (local
 * `pnpm dev` and the build step).
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
