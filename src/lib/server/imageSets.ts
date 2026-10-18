import {
	and,
	desc,
	eq,
	getTableColumns,
	inArray,
	isNotNull,
	isNull,
	sql,
	type SQL
} from 'drizzle-orm';
import type { InValue, ResultSet } from '@libsql/client';
import { purgeArchiveCache } from './cache';
import { client, db } from './db';
import { stampInsert } from './db/audit';
import { isProposedAddition } from './db/proposals';
import { resolveEventId } from './db/queries';
import { event, image, imageSet, imageSetContact } from './db/schema';
import type { Image, ImageSet, ImageSetWithMeta } from './db/schema';
import { deleteImageObjects, ownsImage, type UploadOwner } from './imageUploads';
import type { Actor } from './artefacts';
import { isFullDate, isPartialDate } from '$lib/partialDate';
import { MAX_IMAGES_PER_SET, type ImageSetData } from '$lib/validation/imageSet';

export { MAX_IMAGES_PER_SET } from '$lib/validation/imageSet';

/**
 * Image sets: photographs saved together, with an optional description and
 * event (see `imageSet` in ./db/schema). The upload side — finalizing a
 * photograph into an unattached `image` row, and who owns which — lives in
 * ./imageUploads; this module attaches those rows to sets, keeps them in
 * order, and deletes them with their stored objects once a set lets them go.
 *
 * Attaching is raw SQL in one `client.batch(…, 'write')`: a single atomic
 * round-trip in which every UPDATE re-checks `set_id IS NULL`, so an image
 * another form claimed since the ownership check is skipped rather than
 * stolen, and the affected-row count tells. Raw SQL bypasses Drizzle's
 * `$onUpdate`, so those statements carry `updated_at` (epoch ms) and
 * `updated_by` explicitly, as `mergePeople` in ./db/queries does.
 *
 * `image.set_id` cascades on delete: deleting a set takes its image rows with
 * it. Every path that deletes a set on purpose collects their objects first;
 * every path that backs out of a half-made set detaches its images first.
 */

/** Outcome of a create or update: the set's id, or a refusal to show the form. */
export type ImageSetResult = { ok: true; id: number } | { ok: false; message: string };

const ATTACH_REFUSAL = 'Those photographs could not be attached.';
const GONE_REFUSAL = 'That image set no longer exists.';
/** Why an edit or delete made from an out-of-date page is refused. */
export const STALE_REFUSAL = 'This set changed since you opened it — reload to see the latest.';
const refused = (message = ATTACH_REFUSAL): ImageSetResult => ({ ok: false, message });

/** A set's membership as a form submits it: 1..MAX distinct positive integer ids. */
function isMembership(ids: number[]): boolean {
	return (
		ids.length >= 1 &&
		ids.length <= MAX_IMAGES_PER_SET &&
		ids.every((id) => Number.isSafeInteger(id) && id > 0) &&
		new Set(ids).size === ids.length
	);
}

/**
 * The earliest capture day (`YYYY-MM-DD`) among wall-clock capture times, or
 * null when none has a real one. Wall clock on purpose: the day the camera
 * showed is the day the photograph was taken where it was taken.
 */
function earliestDay(capturedAts: (string | null)[]): string | null {
	let earliest: string | null = null;
	for (const capturedAt of capturedAts) {
		const day = capturedAt?.slice(0, 10);
		if (day && isFullDate(day) && (earliest === null || day < earliest)) earliest = day;
	}
	return earliest;
}

/**
 * A set's date as its photographs give it: the earliest day any of them was
 * taken, or null (undated) when none records a capture date.
 */
export async function computeSetDate(setId: number): Promise<string | null> {
	const rows = await db
		.selectDistinct({ day: sql<string>`substr(${image.capturedAt}, 1, 10)` })
		.from(image)
		.where(and(eq(image.setId, setId), isNotNull(image.capturedAt)));
	return earliestDay(rows.map((row) => row.day));
}

/** A statement, or a condition, with positional arguments: one can be added to another. */
type Sql = { sql: string; args: InValue[] };

const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');

/** `statement` (ending in its WHERE clause), made to affect no row unless `condition` holds. */
const onlyIf = (statement: Sql, condition: Sql): Sql => ({
	sql: `${statement.sql} AND ${condition.sql}`,
	args: [...statement.args, ...condition.args]
});

/** Claim an unattached image for `setId` at `position`; affects no row once it's taken. */
const attachStatement = (
	setId: number,
	imageId: number,
	position: number,
	now: number,
	userId: string | null
): Sql => ({
	sql: 'UPDATE image SET set_id = ?, position = ?, updated_at = ?, updated_by = ? WHERE id = ? AND set_id IS NULL',
	args: [setId, position, now, userId, imageId]
});

/** Move a member of `setId` to `position`; affects no row once it has left the set. */
const repositionStatement = (
	setId: number,
	imageId: number,
	position: number,
	now: number,
	userId: string | null
): Sql => ({
	sql: 'UPDATE image SET position = ?, updated_at = ?, updated_by = ? WHERE id = ? AND set_id = ?',
	args: [position, now, userId, imageId, setId]
});

/** Let go of `imageIds` (all of the set's images when omitted), leaving them unattached. */
function detachStatement(
	setId: number,
	now: number,
	userId: string | null,
	imageIds?: number[]
): Sql {
	const only = imageIds ? ` AND id IN (${placeholders(imageIds.length)})` : '';
	return {
		sql: `UPDATE image SET set_id = NULL, position = 0, updated_at = ?, updated_by = ? WHERE set_id = ?${only}`,
		args: [now, userId, setId, ...(imageIds ?? [])]
	};
}

/** A set's own fields, as an edit writes them. */
type SetFields = Pick<ImageSet, 'description' | 'eventId' | 'dateAuto' | 'date'>;

/** Write `setId`'s fields as `version` (its `updated_at`, in ms), by `userId`. */
const fieldsStatement = (
	setId: number,
	fields: SetFields,
	version: number,
	userId: string | null
): Sql => ({
	sql: 'UPDATE image_set SET description = ?, event_id = ?, date_auto = ?, date = ?, updated_at = ?, updated_by = ? WHERE id = ?',
	args: [fields.description, fields.eventId, fields.dateAuto, fields.date, version, userId, setId]
});

/** Holds while `setId` is still at `version`. */
const atVersion = (setId: number, version: number): Sql => ({
	sql: 'EXISTS (SELECT 1 FROM image_set WHERE id = ? AND updated_at = ?)',
	args: [setId, version]
});

/**
 * Holds while `setId` is as an edit read it: still at `version`, with each of
 * `ids` in it, but for `added`, which may instead still be unattached. Nothing
 * an edit writes changes the answer until it moves the version on, so with
 * that last, every statement of the edit holds or none does.
 */
function asRead(setId: number, version: number, ids: number[], added: number[]): Sql {
	const unattached =
		added.length > 0 ? ` OR (set_id IS NULL AND id IN (${placeholders(added.length)}))` : '';
	const present = `(SELECT count(*) FROM image WHERE id IN (${placeholders(ids.length)}) AND (set_id = ?${unattached})) = ?`;
	const current = atVersion(setId, version);
	return {
		sql: `${current.sql} AND ${present}`,
		args: [...current.args, ...ids, setId, ...added, ids.length]
	};
}

const rowsAffected = (results: { rowsAffected: number }[]) =>
	results.reduce((total, result) => total + result.rowsAffected, 0);

/**
 * Take a half-made set back out: detach whatever it holds, then delete it, in
 * that order and in one transaction — deleting first would cascade to the
 * image rows and lose photographs that are still someone's upload.
 */
async function abandonSet(setId: number, userId: string | null): Promise<void> {
	await client.batch(
		[
			detachStatement(setId, Date.now(), userId),
			{ sql: 'DELETE FROM image_set WHERE id = ?', args: [setId] }
		],
		'write'
	);
}

/** The images `ids` name, with what the ownership and attachment checks read. */
function claimable(ids: number[]) {
	return db
		.select({
			id: image.id,
			setId: image.setId,
			createdBy: image.createdBy,
			originalUrl: image.originalUrl,
			capturedAt: image.capturedAt
		})
		.from(image)
		.where(inArray(image.id, ids));
}

/**
 * Create a set from validated form data, attaching the uploaded images it
 * names, in that order. Every image must exist, be unattached, and belong to
 * `owner` (see `ownsImage`): ids come from the browser, so this is checked
 * here, not trusted. Lands as a proposed addition unless an admin made it (see
 * `isProposedAddition`); a proposed set may only link a vetted event, the only
 * kind its submitter could have seen. The date follows the photographs.
 *
 * Purges the public cache only when the new set is actually public, so
 * anonymous submissions can't trigger CDN purges at will.
 */
export async function createImageSet(
	data: ImageSetData,
	actor: Actor,
	owner: UploadOwner
): Promise<ImageSetResult> {
	const ids = data.imageIds;
	if (!isMembership(ids)) return refused();

	const rows = await claimable(ids);
	const usable =
		rows.length === ids.length && rows.every((row) => row.setId === null && ownsImage(row, owner));
	if (!usable) return refused();

	const proposed = isProposedAddition(actor.role);
	const eventId = await resolveEventId(data.event, proposed);

	// The date comes from the rows just read: a capture time never changes, and
	// these are exactly the set's photographs once the attach below succeeds.
	const [created] = await db
		.insert(imageSet)
		.values({
			description: data.description.trim() || null,
			eventId,
			date: earliestDay(rows.map((row) => row.capturedAt)),
			dateAuto: true,
			proposedAddition: proposed,
			...stampInsert(actor.userId)
		})
		.returning({ id: imageSet.id });

	const now = Date.now();
	let attached: number;
	try {
		const results = await client.batch(
			ids.map((imageId, position) =>
				attachStatement(created.id, imageId, position, now, actor.userId)
			),
			'write'
		);
		attached = rowsAffected(results);
	} catch (e) {
		// An error may still have committed (a reply lost in transit), so back out
		// the safe way, detaching before deleting. Best-effort: the original error
		// is the one worth reporting.
		await abandonSet(created.id, actor.userId).catch((cleanup) =>
			console.error('[imageSets] could not back out set', created.id, cleanup)
		);
		throw e;
	}

	// Short when another form claimed one of these images since the check above
	// (a double submit, two tabs): that form keeps it, this one backs out whole.
	if (attached !== ids.length) {
		await abandonSet(created.id, actor.userId);
		return refused();
	}

	if (!proposed) await purgeArchiveCache();
	return { ok: true, id: created.id };
}

/**
 * Save an admin's edit, made from the set as it stood at `version`: its
 * `updated_at` in ms, as the edit page loaded it. `data.imageIds` is the
 * set's new membership, in order: images already in the set stay; new ones
 * must be unattached uploads of this admin's own; images left out are
 * deleted, rows and stored objects, since they were only ever uploaded for
 * this set. The event resolves against every event, vetted or not. The date
 * follows the photographs while `dateAuto` holds, else it is `data.date`
 * (null: deliberately undated).
 *
 * Refused, changing nothing, once the set has moved on from `version` (another
 * save, an approval): the page never showed that change, so saving it would
 * undo it, deleting any photograph added since. The whole edit — membership,
 * order, fields and the next version — is one write that checks this as it
 * lands, so of two saves made from one version only the first gets through,
 * and a refusal leaves the set as it was.
 */
export async function updateImageSet(
	id: number,
	data: ImageSetData,
	userId: string,
	{ version }: { version: number }
): Promise<ImageSetResult> {
	const ids = data.imageIds;
	if (!isMembership(ids)) return refused();
	if (!data.dateAuto && data.date !== null && !isPartialDate(data.date)) {
		return refused('Pick a valid date');
	}

	const set = await db
		.select({
			description: imageSet.description,
			eventId: imageSet.eventId,
			dateAuto: imageSet.dateAuto,
			date: imageSet.date,
			updatedAt: imageSet.updatedAt,
			updatedBy: imageSet.updatedBy
		})
		.from(imageSet)
		.where(eq(imageSet.id, id))
		.get();
	if (!set) return refused(GONE_REFUSAL);
	// Said early when it's plain; the write below checks again as it lands.
	if (set.updatedAt.getTime() !== version) return refused(STALE_REFUSAL);

	const members = await db
		.select({ id: image.id, position: image.position, capturedAt: image.capturedAt })
		.from(image)
		.where(eq(image.setId, id));
	const memberIds = new Set(members.map((member) => member.id));
	const added = ids.filter((imageId) => !memberIds.has(imageId));
	const addedRows = added.length > 0 ? await claimable(added) : [];
	const owner: UploadOwner = { kind: 'keeper', userId };
	const usable =
		addedRows.length === added.length &&
		addedRows.every((row) => row.setId === null && ownsImage(row, owner));
	if (!usable) return refused();

	const kept = new Set(ids);
	const removed = members.filter((member) => !kept.has(member.id)).map((member) => member.id);
	// As in `createImageSet`, the date comes from the rows just read: they are
	// exactly the set's photographs once the write below lands.
	const fields: SetFields = {
		description: data.description.trim() || null,
		eventId: await resolveEventId(data.event, false),
		dateAuto: data.dateAuto,
		date: data.dateAuto
			? earliestDay(
					[...members.filter((member) => kept.has(member.id)), ...addedRows].map(
						(row) => row.capturedAt
					)
				)
			: data.date
	};

	const now = Date.now();
	// The set's next version: later than the one the edit was made from, even
	// within the same millisecond, so no page opened before it can match it.
	const next = Math.max(now, version + 1);
	const unchanged = asRead(id, version, ids, added);
	// Undo the write below should it land but its reply be lost: only while the
	// set is still at the version it wrote, so a later save is never undone.
	// Harmless if it never landed. The version goes back last, as `ours` reads it.
	const restore = () => {
		const ours = atVersion(id, next);
		return client.batch(
			[
				...(added.length > 0 ? [onlyIf(detachStatement(id, now, userId, added), ours)] : []),
				...members.map((member) =>
					onlyIf(
						kept.has(member.id)
							? repositionStatement(id, member.id, member.position, now, userId)
							: attachStatement(id, member.id, member.position, now, userId),
						ours
					)
				),
				onlyIf(fieldsStatement(id, set, version, set.updatedBy), ours)
			],
			'write'
		);
	};

	// One transaction: the version as the write finds it, then the new order and
	// members, the left-out images let go, and the fields with the next version,
	// each only while `unchanged` holds. That moves the version on, so it's last.
	let results: ResultSet[];
	try {
		results = await client.batch(
			[
				{ sql: 'SELECT updated_at FROM image_set WHERE id = ?', args: [id] },
				...ids.map((imageId, position) =>
					onlyIf(
						memberIds.has(imageId)
							? repositionStatement(id, imageId, position, now, userId)
							: attachStatement(id, imageId, position, now, userId),
						unchanged
					)
				),
				...(removed.length > 0
					? [onlyIf(detachStatement(id, now, userId, removed), unchanged)]
					: []),
				onlyIf(fieldsStatement(id, fields, next, userId), unchanged)
			],
			'write'
		);
	} catch (e) {
		// It may still have committed (a reply lost in transit), as in
		// `createImageSet`. Best-effort: the original error is the one to report.
		await restore().catch((cleanup) =>
			console.error('[imageSets] could not restore set', id, cleanup)
		);
		throw e;
	}

	// Nothing was written unless the last statement was: say why.
	if (results[results.length - 1].rowsAffected !== 1) {
		const found = results[0].rows[0]?.updated_at;
		if (found === undefined) return refused(GONE_REFUSAL);
		// Still at `version`: an image it named was claimed elsewhere, or left the set.
		return refused(Number(found) === version ? ATTACH_REFUSAL : STALE_REFUSAL);
	}

	// The left-out images are unattached now, out of every page's sight; delete
	// them, conditional on staying so (a form that has since claimed one keeps
	// it). Rows first, objects after: a failed object delete leaves an orphan
	// the sweeps remove, never a row pointing at nothing.
	if (removed.length > 0) {
		const deleted = await db
			.delete(image)
			.where(and(inArray(image.id, removed), isNull(image.setId)))
			.returning({ url: image.url, originalUrl: image.originalUrl });
		await deleteImageObjects(deleted);
	}

	await purgeArchiveCache();
	return { ok: true, id };
}

/**
 * Delete a set: its image rows and contact row cascade with it, then the
 * photographs' stored objects are removed (best-effort, see
 * `deleteImageObjects`). With `proposedOnly`, only a set still awaiting review
 * is deleted — the review queue's reject, which must never discard a set an
 * approval has just vetted. With `version` (its `updated_at` in ms, as the edit
 * page read it), only a set still at that version is deleted, so a delete from
 * an out-of-date page can't take photographs it never showed. Returns whether a
 * set was deleted.
 */
export async function deleteImageSet(
	id: number,
	{ proposedOnly = false, version }: { proposedOnly?: boolean; version?: number } = {}
): Promise<boolean> {
	// No set is at a version that isn't a whole number of ms (a form sent none).
	if (version !== undefined && !Number.isSafeInteger(version)) return false;
	// One write transaction, so the objects noted are exactly those of the image
	// rows the delete takes with it, even with an edit landing at the same time.
	const [images, deleted] = await client.batch(
		[
			{ sql: 'SELECT url, original_url FROM image WHERE set_id = ?', args: [id] },
			{
				sql: `DELETE FROM image_set WHERE id = ?${proposedOnly ? ' AND proposed_addition = 1' : ''}${version === undefined ? '' : ' AND updated_at = ?'} RETURNING proposed_addition`,
				args: version === undefined ? [id] : [id, version]
			}
		],
		'write'
	);
	if (deleted.rows.length === 0) return false;

	await deleteImageObjects(
		images.rows.map((row) => ({ url: String(row.url), originalUrl: String(row.original_url) }))
	);
	// A set still under review was never in the public blob.
	if (!Number(deleted.rows[0].proposed_addition)) await purgeArchiveCache();
	return true;
}

/** Sets with their event title flattened in, narrowed by `where`. */
function selectSets(where: SQL | undefined) {
	return db
		.select({ ...getTableColumns(imageSet), event: event.title })
		.from(imageSet)
		.leftJoin(event, eq(imageSet.eventId, event.id))
		.where(where)
		.orderBy(desc(imageSet.date), desc(imageSet.id));
}

/**
 * The images of every set `where` matches, in display order. Filtered through
 * the same set condition as `selectSets` rather than an id list, so the two
 * queries are independent (they run together) and a long list never meets
 * SQLite's bound-parameter limit.
 */
function selectImages(where: SQL | undefined) {
	return db
		.select(getTableColumns(image))
		.from(image)
		.innerJoin(imageSet, eq(image.setId, imageSet.id))
		.where(where)
		.orderBy(image.setId, image.position, image.id);
}

/**
 * `selectImages` without the metadata column. Lists show a cover and a
 * count, and a photo's metadata can run to 64 KB, so reading it for every
 * image of every set would make the list's cost grow with the archive's
 * photographs rather than its sets.
 */
function selectImageSummaries(where: SQL | undefined) {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
	const { metadata, ...columns } = getTableColumns(image);
	return db
		.select(columns)
		.from(image)
		.innerJoin(imageSet, eq(image.setId, imageSet.id))
		.where(where)
		.orderBy(image.setId, image.position, image.id);
}

/** Group `images` under their sets, keeping each set's display order. */
function withImages<T extends { id: number }, I extends { setId: number | null }>(
	sets: T[],
	images: I[]
): (T & { images: I[] })[] {
	const bySet = new Map<number, I[]>();
	for (const row of images) {
		if (row.setId === null) continue;
		const list = bySet.get(row.setId) ?? [];
		list.push(row);
		bySet.set(row.setId, list);
	}
	return sets.map((set) => ({ ...set, images: bySet.get(set.id) ?? [] }));
}

/** One set with its event title and its images in display order; null when there is none. */
export async function loadImageSet(id: number): Promise<ImageSetWithMeta | null> {
	const where = eq(imageSet.id, id);
	const [sets, images] = await Promise.all([selectSets(where), selectImages(where)]);
	return withImages(sets, images)[0] ?? null;
}

/** An image row as the set lists read it: everything but its metadata. */
export type ImageSummary = Omit<Image, 'metadata'>;
/** A set as the lists read it: like `ImageSetWithMeta`, with image summaries. */
export type ImageSetSummary = ImageSet & { event: string | null; images: ImageSummary[] };

/** Every set, vetted or not, newest first (undated last), each with its images in order. */
export async function listImageSets(): Promise<ImageSetSummary[]> {
	const [sets, images] = await Promise.all([
		selectSets(undefined),
		selectImageSummaries(undefined)
	]);
	return withImages(sets, images);
}

/**
 * A proposed set as the review queue reads it: anything a public submitter
 * chose to leave so a keeper can reach them (both null when they left
 * nothing, or for a signed-in contributor's submission).
 */
export type ProposedImageSet = ImageSetSummary & {
	contactName: string | null;
	contactEmail: string | null;
};

/** Sets awaiting review, newest first, with their images and submitter contact. */
export async function listProposedImageSets(): Promise<ProposedImageSet[]> {
	const pending = eq(imageSet.proposedAddition, true);
	const [sets, images] = await Promise.all([
		db
			.select({
				...getTableColumns(imageSet),
				event: event.title,
				contactName: imageSetContact.name,
				contactEmail: imageSetContact.email
			})
			.from(imageSet)
			.leftJoin(event, eq(imageSet.eventId, event.id))
			.leftJoin(imageSetContact, eq(imageSetContact.setId, imageSet.id))
			.where(pending)
			.orderBy(desc(imageSet.date), desc(imageSet.id)),
		selectImageSummaries(pending)
	]);
	return withImages(sets, images);
}
