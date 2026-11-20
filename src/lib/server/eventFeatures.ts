import {
	and,
	desc,
	eq,
	inArray,
	isNull,
	ne,
	or,
	sql,
	type SQL,
	type SQLWrapper
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { InValue } from '@libsql/client';
import { client, db } from './db';
import { artefact, event, eventFeatureImage, image, imageSet } from './db/schema';
import { isImageUrl } from '#lib/fileType.ts';
import { imageSetLabel } from '#lib/images/label.ts';
import type {
	FeatureCandidateGroup,
	FeatureImage,
	FeatureImageWithSource,
	FeatureRef
} from '#lib/featureImage.ts';
import { encodeFeatureRef, sameFeatureRef } from '#lib/featureImage.ts';

/**
 * Feature images: the one photograph or artefact page an event shows as its
 * own (see `eventFeatureImage` in ./db/schema).
 *
 * A stored choice is only a pointer, and the thing it points at can change
 * under it without a cascade: a page dropped from an artefact's `file_urls`, a
 * photograph detached from its set. So nothing reads the row on its own —
 * `featureImagesWhere` resolves it against its source every time, and a choice
 * whose source is gone reads as no feature image. The edit page seeds its field
 * from that resolution too, so saving the form clears a dead choice instead of
 * refusing it.
 */

/** The set's own event, joined separately from the event that features the image. */
const setEvent = alias(event, 'set_event');

/**
 * Resolve the feature image of every event `where` matches (a condition on
 * `event`), keyed by event id. Events with no choice, or whose choice no
 * longer resolves, are absent.
 *
 * With `vettedOnly`, a photograph only counts while its set is vetted and a
 * page only while its artefact is: an event's feature image must not publish
 * a submission nobody has reviewed yet. Keeper pages pass false, as they show
 * pending rows anyway.
 */
export async function featureImagesWhere(
	where: SQL | undefined,
	{ vettedOnly }: { vettedOnly: boolean }
): Promise<Map<number, FeatureImageWithSource>> {
	const rows = await db
		.select({
			eventId: eventFeatureImage.eventId,
			imageId: eventFeatureImage.imageId,
			artefactId: eventFeatureImage.artefactId,
			artefactFileUrl: eventFeatureImage.artefactFileUrl,
			imageUrl: image.url,
			imageWidth: image.width,
			imageHeight: image.height,
			setId: imageSet.id,
			setProposed: imageSet.proposedAddition,
			setDescription: imageSet.description,
			setEvent: setEvent.title,
			setCount: sql<number>`(SELECT count(*) FROM ${image} AS i WHERE i.set_id = ${imageSet.id})`,
			artefactTitle: artefact.artefact,
			artefactFileUrls: artefact.fileUrls,
			artefactProposed: artefact.proposedAddition
		})
		.from(eventFeatureImage)
		.innerJoin(event, eq(event.id, eventFeatureImage.eventId))
		.leftJoin(image, eq(image.id, eventFeatureImage.imageId))
		// Inner to the set in effect: a detached photograph has no set, and is skipped below.
		.leftJoin(imageSet, eq(imageSet.id, image.setId))
		.leftJoin(setEvent, eq(setEvent.id, imageSet.eventId))
		.leftJoin(artefact, eq(artefact.id, eventFeatureImage.artefactId))
		.where(where);

	const byEvent = new Map<number, FeatureImageWithSource>();
	for (const row of rows) {
		if (row.imageId !== null) {
			if (row.imageUrl === null || row.setId === null) continue;
			if (vettedOnly && row.setProposed) continue;
			byEvent.set(row.eventId, {
				url: row.imageUrl,
				width: row.imageWidth,
				height: row.imageHeight,
				ref: { kind: 'image', imageId: row.imageId },
				source: {
					kind: 'image',
					setId: row.setId,
					label: imageSetLabel({
						event: row.setEvent,
						description: row.setDescription,
						count: Number(row.setCount)
					}),
					proposed: row.setProposed === true
				}
			});
		} else if (row.artefactId !== null && row.artefactFileUrl !== null) {
			const url = row.artefactFileUrl;
			// The page must still be one of the artefact's, and still an image.
			if (row.artefactTitle === null || !row.artefactFileUrls?.includes(url)) continue;
			if (!isImageUrl(url)) continue;
			if (vettedOnly && row.artefactProposed) continue;
			byEvent.set(row.eventId, {
				url,
				width: null,
				height: null,
				ref: { kind: 'artefact', artefactId: row.artefactId, url },
				source: {
					kind: 'artefact',
					artefactId: row.artefactId,
					label: row.artefactTitle,
					proposed: row.artefactProposed === true
				}
			});
		}
	}
	return byEvent;
}

/** One event's resolved feature image, or null (see `featureImagesWhere`). */
export async function loadFeatureImage(
	eventId: number,
	{ vettedOnly }: { vettedOnly: boolean }
): Promise<FeatureImageWithSource | null> {
	const found = await featureImagesWhere(eq(event.id, eventId), { vettedOnly });
	return found.get(eventId) ?? null;
}

/** Just what a feature image renders as: no ids, no labels. */
export function publicFeatureImage(feature: FeatureImage): FeatureImage {
	return { url: feature.url, width: feature.width, height: feature.height };
}

/** The choice as stored for `eventId`, resolved or not; null when there is none. */
async function storedRef(eventId: number): Promise<FeatureRef | null> {
	const [row] = await db
		.select()
		.from(eventFeatureImage)
		.where(eq(eventFeatureImage.eventId, eventId))
		.limit(1);
	if (!row) return null;
	if (row.imageId !== null) return { kind: 'image', imageId: row.imageId };
	if (row.artefactId !== null && row.artefactFileUrl !== null) {
		return { kind: 'artefact', artefactId: row.artefactId, url: row.artefactFileUrl };
	}
	return null;
}

/**
 * The condition under which `ref` names something that can be featured, as SQL
 * with its arguments: a photograph that belongs to a set, or a URL that is one
 * of that artefact's pages. Null when the ref can be refused without asking
 * the database (a page that isn't an image).
 */
function sourceExists(ref: FeatureRef): { sql: string; args: InValue[] } | null {
	if (ref.kind === 'image') {
		return {
			sql: 'EXISTS (SELECT 1 FROM image WHERE id = ? AND set_id IS NOT NULL)',
			args: [ref.imageId]
		};
	}
	if (!isImageUrl(ref.url)) return null;
	return {
		sql: 'EXISTS (SELECT 1 FROM artefact, json_each(artefact.file_urls) WHERE artefact.id = ? AND json_each.value = ?)',
		args: [ref.artefactId, ref.url]
	};
}

/**
 * Whether `ref` names something that can be featured right now. For a form
 * that must refuse a bad choice before it writes anything else (creating an
 * event); `setFeatureImage` checks again as it writes.
 */
export async function canFeature(ref: FeatureRef): Promise<boolean> {
	const exists = sourceExists(ref);
	if (exists === null) return false;
	const result = await client.execute({ sql: `SELECT ${exists.sql} AS ok`, args: exists.args });
	return Number(result.rows[0]?.ok) === 1;
}

/**
 * Make `ref` the feature image of `eventId`, or clear it with null. Returns
 * false, writing nothing, when `ref` names nothing that can be featured: a
 * photograph that doesn't exist or belongs to no set, or a URL that isn't an
 * image page of that artefact (or an event that's gone).
 *
 * The check and the write are one statement (`INSERT … SELECT … WHERE
 * EXISTS`), so a photograph or page removed in between can't be saved as the
 * choice, and a missing row is a refusal rather than a foreign key error. An
 * unchanged choice isn't rewritten, so its audit columns keep saying who made it.
 */
export async function setFeatureImage(
	eventId: number,
	ref: FeatureRef | null,
	userId: string
): Promise<boolean> {
	if (ref === null) {
		await db.delete(eventFeatureImage).where(eq(eventFeatureImage.eventId, eventId));
		return true;
	}
	if (sameFeatureRef(await storedRef(eventId), ref)) return true;

	const exists = sourceExists(ref);
	if (exists === null) return false;
	const values = ref.kind === 'image' ? [ref.imageId, null, null] : [null, ref.artefactId, ref.url];

	// Raw SQL bypasses Drizzle's `$onUpdate` and defaults' audit stamps, so the
	// row carries its timestamps (epoch ms) and actors explicitly.
	const now = Date.now();
	const result = await client.execute({
		sql: `INSERT INTO event_feature_image
				(event_id, image_id, artefact_id, artefact_file_url, created_at, updated_at, created_by, updated_by)
			SELECT ?, ?, ?, ?, ?, ?, ?, ?
			WHERE EXISTS (SELECT 1 FROM event WHERE id = ?) AND ${exists.sql}
			ON CONFLICT (event_id) DO UPDATE SET
				image_id = excluded.image_id,
				artefact_id = excluded.artefact_id,
				artefact_file_url = excluded.artefact_file_url,
				updated_at = excluded.updated_at,
				updated_by = excluded.updated_by`,
		args: [eventId, ...values, now, now, userId, userId, eventId, ...exists.args]
	});
	return result.rowsAffected > 0;
}

/** How many sources of each kind the picker lists at most, per search. */
export const CANDIDATE_LIMIT = 40;

/** `text` as a LIKE pattern matching it literally, under `ESCAPE '\'`. */
const likeLiteral = (text: string) => text.replace(/[\\%_]/g, '\\$&');

/** Newest first, undated last, as the keeper lists order. */
function byDateDesc(a: FeatureCandidateGroup, b: FeatureCandidateGroup): number {
	if (a.date === b.date) return b.id - a.id;
	if (a.date === null) return 1;
	if (b.date === null) return -1;
	return a.date < b.date ? 1 : -1;
}

/**
 * The photographs and artefact pages a keeper can pick from for `eventId`,
 * grouped by the image set or artefact they belong to, newest first. A null
 * `eventId` is an event still being created: nothing is linked to it yet.
 *
 * With `linked`, only the sources linked to that event, all of them: what the
 * picker leads with. Without it, sources linked to any other event or none
 * (every source, for a null `eventId`), narrowed by `q` (an artefact's title, description or number; a set's
 * description or event title), at most `CANDIDATE_LIMIT` of each kind.
 * Pending submissions are included and flagged: a keeper may choose one, and
 * it shows publicly once vetted (see `featureImagesWhere`).
 */
export async function listFeatureCandidates(
	eventId: number | null,
	{ linked, q = '' }: { linked: boolean; q?: string }
): Promise<{ groups: FeatureCandidateGroup[]; truncated: boolean }> {
	if (linked && eventId === null) return { groups: [], truncated: false };
	const term = q.trim().toLowerCase();
	const pattern = `%${likeLiteral(term)}%`;
	const contains = (column: SQLWrapper) => sql`lower(${column}) LIKE ${pattern} ESCAPE '\\'`;

	const artefactWhere = and(
		eventId === null
			? undefined
			: linked
				? eq(artefact.eventId, eventId)
				: or(isNull(artefact.eventId), ne(artefact.eventId, eventId)),
		// Only artefacts with something attached; the image test itself is below.
		sql`json_array_length(${artefact.fileUrls}) > 0`,
		term && !linked
			? or(
					contains(artefact.artefact),
					contains(artefact.description),
					// Artefact numbers are written on the objects themselves.
					sql`cast(${artefact.id} AS text) = ${term.replace(/^#/, '')}`
				)
			: undefined
	);
	const setWhere = and(
		eventId === null
			? undefined
			: linked
				? eq(imageSet.eventId, eventId)
				: or(isNull(imageSet.eventId), ne(imageSet.eventId, eventId)),
		term && !linked ? or(contains(imageSet.description), contains(setEvent.title)) : undefined
	);
	const artefactQuery = db
		.select({
			id: artefact.id,
			title: artefact.artefact,
			date: artefact.date,
			fileUrls: artefact.fileUrls,
			proposed: artefact.proposedAddition
		})
		.from(artefact)
		.where(artefactWhere)
		.orderBy(desc(artefact.date), desc(artefact.id))
		.$dynamic();
	const setQuery = db
		.select({
			id: imageSet.id,
			description: imageSet.description,
			event: setEvent.title,
			date: imageSet.date,
			proposed: imageSet.proposedAddition
		})
		.from(imageSet)
		.leftJoin(setEvent, eq(setEvent.id, imageSet.eventId))
		.where(setWhere)
		.orderBy(desc(imageSet.date), desc(imageSet.id))
		.$dynamic();
	if (!linked) {
		// One past the cap, so the picker can say the list was cut short. A
		// dynamic query's `limit` sets it in place.
		artefactQuery.limit(CANDIDATE_LIMIT + 1);
		setQuery.limit(CANDIDATE_LIMIT + 1);
	}
	const [artefactRows, setRows] = await Promise.all([artefactQuery, setQuery]);

	const truncated =
		!linked && (artefactRows.length > CANDIDATE_LIMIT || setRows.length > CANDIDATE_LIMIT);
	const artefacts = linked ? artefactRows : artefactRows.slice(0, CANDIDATE_LIMIT);
	const sets = linked ? setRows : setRows.slice(0, CANDIDATE_LIMIT);

	// The chosen sets' photographs in one query, display order, no metadata.
	const setIds = sets.map((s) => s.id);
	const photos =
		setIds.length === 0
			? []
			: await db
					.select({
						id: image.id,
						setId: image.setId,
						url: image.url,
						width: image.width,
						height: image.height
					})
					.from(image)
					.where(inArray(image.setId, setIds))
					.orderBy(image.setId, image.position, image.id);
	const photosBySet = new Map<number, typeof photos>();
	for (const photo of photos) {
		const list = photosBySet.get(photo.setId!) ?? [];
		list.push(photo);
		photosBySet.set(photo.setId!, list);
	}

	const groups: FeatureCandidateGroup[] = [
		...artefacts.map((row) => ({
			kind: 'artefact' as const,
			id: row.id,
			label: row.title,
			date: row.date,
			proposed: row.proposed,
			images: row.fileUrls.filter(isImageUrl).map((url) => ({
				ref: encodeFeatureRef({ kind: 'artefact', artefactId: row.id, url }),
				url,
				width: null,
				height: null
			}))
		})),
		...sets.map((row) => {
			const list = photosBySet.get(row.id) ?? [];
			return {
				kind: 'imageSet' as const,
				id: row.id,
				label: imageSetLabel({
					event: row.event,
					description: row.description,
					count: list.length
				}),
				date: row.date,
				proposed: row.proposed,
				images: list.map((photo) => ({
					ref: encodeFeatureRef({ kind: 'image', imageId: photo.id }),
					url: photo.url,
					width: photo.width,
					height: photo.height
				}))
			};
		})
	]
		// An artefact of PDFs alone, or a set whose create failed halfway: nothing to pick.
		.filter((group) => group.images.length > 0)
		.sort(byDateDesc);

	return { groups, truncated };
}
