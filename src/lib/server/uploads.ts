import { inArray, like, sql } from 'drizzle-orm';
import { db } from './db';
import { artefact } from './db/schema';
import { deleteScan, keyFromUrl, listScans, urlForKey } from './scans';

/**
 * Housekeeping for uploaded images that nothing uses. Two sources of orphans:
 *  - a rejected submission's images (cleaned up as the rejection happens);
 *  - uploads a visitor abandoned without submitting (swept daily).
 *
 * Everything here is best-effort: a storage hiccup must never fail the
 * rejection or sweep that triggered it — the next sweep picks up the rest.
 */

/** Which of `urls` some artefact still lists in its `file_urls`. */
async function referencedUrls(urls: string[]): Promise<Set<string>> {
	if (urls.length === 0) return new Set();
	const rows = await db
		.select({ url: sql<string>`value` })
		.from(sql`${artefact}, json_each(${artefact.fileUrls})`)
		.where(inArray(sql`value`, urls));
	return new Set(rows.map((r) => r.url));
}

/** Delete those of `urls` that are ours and that no artefact references. */
export async function deleteUnreferencedImages(urls: string[]): Promise<number> {
	try {
		const ours = urls.filter((url) => keyFromUrl(url) !== null);
		const inUse = await referencedUrls(ours);
		let deleted = 0;
		for (const url of ours) {
			if (inUse.has(url)) continue;
			await deleteScan(keyFromUrl(url)!);
			deleted++;
		}
		return deleted;
	} catch (e) {
		console.error('[uploads] image cleanup failed', e);
		return 0;
	}
}

/** Uploads younger than this are left alone: someone may still be filling in the form. */
export const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;
/** Cap per run, so one sweep stays well inside a function's time limit. */
const MAX_DELETES_PER_SWEEP = 500;

/**
 * Delete anonymous uploads (`submissions/…`) that are older than a day and
 * attached to no artefact — scans from a form that was never submitted.
 */
export async function sweepAbandonedSubmissions(now = Date.now()): Promise<number> {
	const stale = (await listScans('submissions/')).filter(
		(object) => now - object.lastModified.getTime() > ABANDONED_AFTER_MS
	);
	if (stale.length === 0) return 0;

	// One query for every submission URL still in use, rather than one per object.
	const rows = await db
		.select({ url: sql<string>`value` })
		.from(sql`${artefact}, json_each(${artefact.fileUrls})`)
		.where(like(sql`value`, `${urlForKey('submissions/')}%`));
	const inUse = new Set(rows.map((r) => r.url));

	let deleted = 0;
	for (const { key } of stale) {
		if (deleted >= MAX_DELETES_PER_SWEEP) break;
		if (inUse.has(urlForKey(key))) continue;
		await deleteScan(key);
		deleted++;
	}
	return deleted;
}
