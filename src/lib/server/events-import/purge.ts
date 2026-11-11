/**
 * Refresh the public site's cached archive dataset after a script writes
 * public events straight to the database (keeper edits do this themselves).
 */
export async function purgeArchiveCache(token: string): Promise<void> {
	const { purgeCache } = await import('@netlify/functions');
	const siteID = process.env.NETLIFY_SITE_ID;
	await purgeCache(
		siteID
			? { tags: ['archive'], token, siteID }
			: { tags: ['archive'], token, siteSlug: process.env.NETLIFY_SITE_SLUG || 'tag-archive' }
	);
}
