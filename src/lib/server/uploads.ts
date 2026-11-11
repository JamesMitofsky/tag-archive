import { and, inArray, isNull, like, lt, or, sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import { artefact, image } from './db/schema';
import { deleteScan, isPlainKey, keyFromUrl, listScans } from './scans';

/**
 * Housekeeping for uploaded images that nothing uses. Sources of orphans:
 *  - a rejected submission's images (cleaned up as the rejection happens);
 *  - uploads a visitor abandoned without submitting (swept daily);
 *  - photographs finalized but never saved into a set, and photographs whose
 *    upload never reached finalize (both swept daily).
 *
 * Everything here is best-effort: a storage hiccup must never fail the
 * rejection or sweep that triggered it — the next sweep picks up the rest.
 *
 * "In use" always means the same thing: listed in some artefact's
 * `file_urls`, or the display copy or original of some `image` row, attached
 * or not. An unattached image row still belongs to a form someone may be
 * filling in; `sweepUnattachedImages` is what retires it.
 *
 * And it is judged by the object a stored URL names, not by the URL's full
 * text. A record written under an earlier public base (`R2_PUBLIC_URL` moved
 * from r2.dev to a custom domain, say) still points at the same object; were
 * whole URLs compared, every such object would look unused after the move,
 * and the sweeps would delete the archive's photographs.
 */

/**
 * Stored URLs that `match` picks, from everywhere a URL is stored: artefacts'
 * `file_urls` and both URL columns of `image` — one query. `match` gets each
 * as an SQL expression, so one condition serves all three.
 */
async function storedUrls(match: (url: SQL) => SQL | undefined) {
	const rows = await db
		.select({ url: sql<string>`value` })
		.from(sql`${artefact}, json_each(${artefact.fileUrls})`)
		.where(match(sql`value`))
		.union(
			db
				.select({ url: image.url })
				.from(image)
				.where(match(sql`${image.url}`))
		)
		.union(
			db
				.select({ url: image.originalUrl })
				.from(image)
				.where(match(sql`${image.originalUrl}`))
		);
	return rows.map((row) => row.url);
}

/** `text` as a LIKE pattern matching it literally, under `ESCAPE '\'`. */
const likeLiteral = (text: string) => text.replace(/[\\%_]/g, '\\$&');

/**
 * Which of `urls` something still uses (see above). Everything that deletes
 * an object by URL asks this first, so no path can delete what a record still
 * points at. A URL of ours counts as used when any stored URL ends in its key;
 * one that isn't ours (a legacy static path) only when stored as is. Meant
 * for one record's handful of URLs; the sweeps use `keysInUseUnder`.
 */
export async function referencedUrls(urls: string[]): Promise<Set<string>> {
	const wanted = [...new Set(urls)].map((url) => {
		const key = keyFromUrl(url);
		return { url, tail: key === null ? null : `/${key}` };
	});
	if (wanted.length === 0) return new Set();

	const exact = wanted.map(({ url }) => url);
	const tails = [...new Set(wanted.flatMap(({ tail }) => (tail === null ? [] : [tail])))];
	const stored = await storedUrls((value) =>
		or(
			inArray(value, exact),
			// LIKE narrows (it ignores case); the exact test is `endsWith` below.
			...tails.map((tail) => sql`${value} LIKE ${`%${likeLiteral(tail)}`} ESCAPE '\\'`)
		)
	);
	const used = wanted.filter(({ url, tail }) =>
		stored.some((s) => s === url || (tail !== null && s.endsWith(tail)))
	);
	return new Set(used.map(({ url }) => url));
}

/**
 * Every key under `folder` (`images/`, `submissions/`) that something still
 * uses, in one query — for the sweeps, which judge whole listings at once.
 * Each stored URL mentioning the folder contributes its tail from every
 * `/<folder>` in it, so the key it names is among them whatever base it was
 * written under (a tail that is no key, from a base whose own path holds the
 * folder's name, only ever keeps more).
 */
async function keysInUseUnder(folder: string): Promise<Set<string>> {
	const marker = `/${folder}`;
	const keys = new Set<string>();
	for (const url of await storedUrls((value) => like(value, `%${marker}%`))) {
		for (let at = url.indexOf(marker); at !== -1; at = url.indexOf(marker, at + 1)) {
			keys.add(url.slice(at + 1));
		}
	}
	return keys;
}

/** Delete those of `urls` that are ours and that nothing references. */
export async function deleteUnreferencedImages(urls: string[]): Promise<number> {
	try {
		const ours = [...new Set(urls)].filter((url) => keyFromUrl(url) !== null);
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
 * that nothing uses — scans from a form that was never submitted, and
 * photographs whose image row is gone (or never got written).
 */
export async function sweepAbandonedSubmissions(now = Date.now()): Promise<number> {
	const stale = (await listScans('submissions/')).filter(
		(object) =>
			now - object.lastModified.getTime() > ABANDONED_AFTER_MS &&
			// The archive only ever writes plain keys, and `deleteScan` refuses any other.
			isPlainKey(object.key)
	);
	if (stale.length === 0) return 0;

	// One query for every submission key still in use, rather than one per object.
	const inUse = await keysInUseUnder('submissions/');

	let deleted = 0;
	for (const { key } of stale) {
		if (deleted >= MAX_DELETES_PER_SWEEP) break;
		if (inUse.has(key)) continue;
		await deleteScan(key);
		deleted++;
	}
	return deleted;
}

/**
 * Delete photographs finalized more than a day ago but never saved into a set
 * — an uploader closed before its form was submitted — with their stored
 * objects. Returns how many rows went.
 *
 * Rows first, objects after, and the delete re-checks `set_id IS NULL`: a
 * form that attaches one of these between the select and the delete keeps it,
 * objects and all. Objects a failed delete leaves behind have no row any
 * more, so the object sweeps below remove them (the cron runs this before them).
 */
export async function sweepUnattachedImages(now = Date.now()): Promise<number> {
	const cutoff = new Date(now - ABANDONED_AFTER_MS);
	const stale = db
		.select({ id: image.id })
		.from(image)
		.where(and(isNull(image.setId), lt(image.createdAt, cutoff)))
		.orderBy(image.createdAt)
		.limit(MAX_DELETES_PER_SWEEP);
	const deleted = await db
		.delete(image)
		.where(and(inArray(image.id, stale), isNull(image.setId)))
		.returning({ url: image.url, originalUrl: image.originalUrl });
	if (deleted.length > 0) {
		// Loaded here, not at the top: ./imageUploads pulls in the metadata
		// parser, and every route that reads ./db/queries imports this module.
		const { deleteImageObjects } = await import('./imageUploads');
		await deleteImageObjects(deleted);
	}
	return deleted.length;
}

/**
 * A keeper's photograph object, as ./imageKeys lays them out (a display copy's
 * folder is uuid-shaped too): only these are ever swept, so nothing else
 * stored under `images/` is touched.
 */
const KEEPER_IMAGE_OBJECT_RE =
	/^images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:original\.(?:jpg|png|webp|gif|heic)|display\.webp)$/;

/**
 * Delete keepers' photograph objects (`images/…`) older than a day that
 * nothing records — an upload that never reached finalize, or one whose
 * row was deleted while removing its objects failed. Contributors' are under
 * `submissions/`, which `sweepAbandonedSubmissions` covers. Returns how many
 * objects went.
 */
export async function sweepOrphanObjects(now = Date.now()): Promise<number> {
	const stale = (await listScans('images/')).filter(
		(object) =>
			now - object.lastModified.getTime() > ABANDONED_AFTER_MS &&
			KEEPER_IMAGE_OBJECT_RE.test(object.key)
	);
	if (stale.length === 0) return 0;

	const inUse = await keysInUseUnder('images/');

	let deleted = 0;
	for (const { key } of stale) {
		if (deleted >= MAX_DELETES_PER_SWEEP) break;
		if (inUse.has(key)) continue;
		await deleteScan(key);
		deleted++;
	}
	return deleted;
}
