import { and, desc, eq, getTableColumns, inArray, isNull, type SQL } from 'drizzle-orm';
import type { InValue, ResultSet } from '@libsql/client';
import { purgeArchiveCache } from './cache';
import { client, db } from './db';
import { stampInsert } from './db/audit';
import { isProposedAddition } from './db/proposals';
import { resolveEventId } from './db/queries';
import { album, event, track } from './db/schema';
import type { Album, AlbumWithMeta, Track } from './db/schema';
import type { Actor } from './artefacts';
import { deleteTrackObjects, ownsTrack } from './trackUploads';
import { isPartialDate } from '#lib/partialDate.ts';
import { isTrackMembership, type AlbumData, type AlbumTrackInput } from '#lib/validation/album.ts';

/**
 * Albums: recorded music saved as an ordered set of tracks (see `album` in
 * ./db/schema). The upload side — finalizing a file into an unattached
 * `track` row — lives in ./trackUploads; this module attaches those rows to
 * albums, keeps their order and titles, and deletes them with their stored
 * files once an album lets them go.
 *
 * Built the way ./imageSets is, for the same reasons. Attaching is raw SQL in
 * one `client.batch(…, 'write')`, a single atomic round-trip in which every
 * UPDATE re-checks `album_id IS NULL`, so a track another form claimed since
 * the ownership check is skipped rather than stolen, and the affected-row
 * count tells. Raw SQL bypasses Drizzle's `$onUpdate`, so those statements
 * carry `updated_at` (epoch ms) and `updated_by` explicitly.
 *
 * `track.album_id` cascades on delete: deleting an album takes its track rows
 * with it. Every path that deletes an album on purpose collects their files
 * first; every path that backs out of a half-made album detaches its tracks
 * first.
 */

/** Outcome of a create or update: the album's id, or a refusal to show the form. */
export type AlbumResult = { ok: true; id: number } | { ok: false; message: string };

const ATTACH_REFUSAL = 'Those tracks could not be attached.';
const GONE_REFUSAL = 'That album no longer exists.';
/** Why an edit or delete made from an out-of-date page is refused. */
export const STALE_REFUSAL = 'This album changed since you opened it — reload to see the latest.';
const refused = (message = ATTACH_REFUSAL): AlbumResult => ({ ok: false, message });

/** A statement, or a condition, with positional arguments: one can be added to another. */
type Sql = { sql: string; args: InValue[] };

const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');

/** `statement` (ending in its WHERE clause), made to affect no row unless `condition` holds. */
const onlyIf = (statement: Sql, condition: Sql): Sql => ({
	sql: `${statement.sql} AND ${condition.sql}`,
	args: [...statement.args, ...condition.args]
});

/** Claim an unattached track for `albumId` at `position`; affects no row once it's taken. */
const attachStatement = (
	albumId: number,
	trackId: number,
	position: number,
	title: string,
	now: number,
	userId: string | null
): Sql => ({
	sql: 'UPDATE track SET album_id = ?, position = ?, title = ?, updated_at = ?, updated_by = ? WHERE id = ? AND album_id IS NULL',
	args: [albumId, position, title, now, userId, trackId]
});

/** Move (and retitle) a track of `albumId`; affects no row once it has left the album. */
const repositionStatement = (
	albumId: number,
	trackId: number,
	position: number,
	title: string,
	now: number,
	userId: string | null
): Sql => ({
	sql: 'UPDATE track SET position = ?, title = ?, updated_at = ?, updated_by = ? WHERE id = ? AND album_id = ?',
	args: [position, title, now, userId, trackId, albumId]
});

/** Let go of `trackIds` (all of the album's tracks when omitted), leaving them unattached. */
function detachStatement(
	albumId: number,
	now: number,
	userId: string | null,
	trackIds?: number[]
): Sql {
	const only = trackIds ? ` AND id IN (${placeholders(trackIds.length)})` : '';
	return {
		sql: `UPDATE track SET album_id = NULL, position = 0, updated_at = ?, updated_by = ? WHERE album_id = ?${only}`,
		args: [now, userId, albumId, ...(trackIds ?? [])]
	};
}

/** An album's own fields, as an edit writes them. */
type AlbumFields = Pick<Album, 'title' | 'artist' | 'description' | 'eventId' | 'date'>;

/** Write `albumId`'s fields as `version` (its `updated_at`, in ms), by `userId`. */
const fieldsStatement = (
	albumId: number,
	fields: AlbumFields,
	version: number,
	userId: string | null
): Sql => ({
	sql: 'UPDATE album SET title = ?, artist = ?, description = ?, event_id = ?, date = ?, updated_at = ?, updated_by = ? WHERE id = ?',
	args: [
		fields.title,
		fields.artist,
		fields.description,
		fields.eventId,
		fields.date,
		version,
		userId,
		albumId
	]
});

/** Holds while `albumId` is still at `version`. */
const atVersion = (albumId: number, version: number): Sql => ({
	sql: 'EXISTS (SELECT 1 FROM album WHERE id = ? AND updated_at = ?)',
	args: [albumId, version]
});

/**
 * Holds while `albumId` is as an edit read it: still at `version`, with each
 * of `ids` in it, but for `added`, which may instead still be unattached.
 * Nothing an edit writes changes the answer until it moves the version on,
 * so with that last, every statement of the edit holds or none does.
 */
function asRead(albumId: number, version: number, ids: number[], added: number[]): Sql {
	const unattached =
		added.length > 0 ? ` OR (album_id IS NULL AND id IN (${placeholders(added.length)}))` : '';
	const present = `(SELECT count(*) FROM track WHERE id IN (${placeholders(ids.length)}) AND (album_id = ?${unattached})) = ?`;
	const current = atVersion(albumId, version);
	return {
		sql: `${current.sql} AND ${present}`,
		args: [...current.args, ...ids, albumId, ...added, ids.length]
	};
}

const rowsAffected = (results: { rowsAffected: number }[]) =>
	results.reduce((total, result) => total + result.rowsAffected, 0);

/**
 * Take a half-made album back out: detach whatever it holds, then delete it,
 * in that order and in one transaction — deleting first would cascade to the
 * track rows and lose files that are still someone's upload.
 */
async function abandonAlbum(albumId: number, userId: string | null): Promise<void> {
	await client.batch(
		[
			detachStatement(albumId, Date.now(), userId),
			{ sql: 'DELETE FROM album WHERE id = ?', args: [albumId] }
		],
		'write'
	);
}

/** The tracks `ids` name, with what the ownership and attachment checks read. */
function claimable(ids: number[]) {
	return db
		.select({ id: track.id, albumId: track.albumId, createdBy: track.createdBy })
		.from(track)
		.where(inArray(track.id, ids));
}

/** Empty text → null, for the album's nullable columns. */
const nullIfEmpty = (value: string) => value.trim() || null;

/** An album's own fields from validated form data. */
async function fieldsFrom(data: AlbumData): Promise<AlbumFields> {
	return {
		title: data.title.trim(),
		artist: nullIfEmpty(data.artist),
		description: nullIfEmpty(data.description),
		eventId: await resolveEventId(data.event, data.eventId),
		date: data.date
	};
}

/** Whether a form's tracks name a valid membership, with a title each. */
function usableTracks(tracks: AlbumTrackInput[]): boolean {
	return isTrackMembership(tracks.map((t) => t.id)) && tracks.every((t) => t.title.trim() !== '');
}

/**
 * Create an album from validated form data, attaching the uploaded tracks it
 * names, in that order and under the titles given. Every track must exist,
 * be unattached, and have been uploaded by this keeper (see `ownsTrack`): ids
 * come from the browser, so this is checked here, not trusted. Lands as a
 * proposed addition unless an admin made it (see `isProposedAddition`).
 */
export async function createAlbum(data: AlbumData, actor: Actor): Promise<AlbumResult> {
	const userId = actor.userId;
	if (!userId) return refused();
	if (!usableTracks(data.tracks)) return refused();
	if (data.date === '' || (data.date !== null && !isPartialDate(data.date))) {
		return refused('Pick a valid date');
	}
	const ids = data.tracks.map((t) => t.id);

	const rows = await claimable(ids);
	const usable =
		rows.length === ids.length &&
		rows.every((row) => row.albumId === null && ownsTrack(row, userId));
	if (!usable) return refused();

	const proposed = isProposedAddition(actor.role);
	const [created] = await db
		.insert(album)
		.values({ ...(await fieldsFrom(data)), proposedAddition: proposed, ...stampInsert(userId) })
		.returning({ id: album.id });

	const now = Date.now();
	let attached: number;
	try {
		const results = await client.batch(
			data.tracks.map((t, position) =>
				attachStatement(created.id, t.id, position, t.title.trim(), now, userId)
			),
			'write'
		);
		attached = rowsAffected(results);
	} catch (e) {
		// An error may still have committed (a reply lost in transit), so back out
		// the safe way, detaching before deleting. Best-effort: the original error
		// is the one worth reporting.
		await abandonAlbum(created.id, userId).catch((cleanup) =>
			console.error('[albums] could not back out album', created.id, cleanup)
		);
		throw e;
	}

	// Short when another form claimed one of these tracks since the check above
	// (a double submit, two tabs): that form keeps it, this one backs out whole.
	if (attached !== ids.length) {
		await abandonAlbum(created.id, userId);
		return refused();
	}

	if (!proposed) await purgeArchiveCache();
	return { ok: true, id: created.id };
}

/**
 * Save an admin's edit, made from the album as it stood at `version`: its
 * `updated_at` in ms, as the edit page loaded it. `data.tracks` is the
 * album's new tracklist, in order: tracks already in the album stay (under
 * their new titles); new ones must be unattached uploads of this admin's
 * own; tracks left out are deleted, rows and stored files, since they were
 * only ever uploaded for this album.
 *
 * Refused, changing nothing, once the album has moved on from `version`
 * (another save, an approval): the page never showed that change, so saving
 * it would undo it, deleting any track added since. The whole edit —
 * tracklist, order, titles, fields and the next version — is one write that
 * checks this as it lands, so of two saves made from one version only the
 * first gets through, and a refusal leaves the album as it was.
 */
export async function updateAlbum(
	id: number,
	data: AlbumData,
	userId: string,
	{ version }: { version: number }
): Promise<AlbumResult> {
	if (!usableTracks(data.tracks)) return refused();
	if (data.date === '' || (data.date !== null && !isPartialDate(data.date))) {
		return refused('Pick a valid date');
	}
	const ids = data.tracks.map((t) => t.id);

	const current = await db.select().from(album).where(eq(album.id, id)).get();
	if (!current) return refused(GONE_REFUSAL);
	// Said early when it's plain; the write below checks again as it lands.
	if (current.updatedAt.getTime() !== version) return refused(STALE_REFUSAL);

	const members = await db
		.select({ id: track.id, position: track.position, title: track.title })
		.from(track)
		.where(eq(track.albumId, id));
	const memberIds = new Set(members.map((member) => member.id));
	const added = ids.filter((trackId) => !memberIds.has(trackId));
	const addedRows = added.length > 0 ? await claimable(added) : [];
	const usable =
		addedRows.length === added.length &&
		addedRows.every((row) => row.albumId === null && ownsTrack(row, userId));
	if (!usable) return refused();

	const kept = new Set(ids);
	const removed = members.filter((member) => !kept.has(member.id)).map((member) => member.id);
	const fields = await fieldsFrom(data);

	const now = Date.now();
	// The album's next version: later than the one the edit was made from, even
	// within the same millisecond, so no page opened before it can match it.
	const next = Math.max(now, version + 1);
	const unchanged = asRead(id, version, ids, added);
	// Undo the write below should it land but its reply be lost: only while the
	// album is still at the version it wrote, so a later save is never undone.
	// Harmless if it never landed. The version goes back last, as `ours` reads it.
	const restore = () => {
		const ours = atVersion(id, next);
		return client.batch(
			[
				...(added.length > 0 ? [onlyIf(detachStatement(id, now, userId, added), ours)] : []),
				...members.map((member) =>
					onlyIf(
						kept.has(member.id)
							? repositionStatement(id, member.id, member.position, member.title, now, userId)
							: attachStatement(id, member.id, member.position, member.title, now, userId),
						ours
					)
				),
				onlyIf(fieldsStatement(id, current, version, current.updatedBy), ours)
			],
			'write'
		);
	};

	// One transaction: the version as the write finds it, then the new order,
	// titles and members, the left-out tracks let go, and the fields with the
	// next version, each only while `unchanged` holds. That moves the version
	// on, so it's last.
	let results: ResultSet[];
	try {
		results = await client.batch(
			[
				{ sql: 'SELECT updated_at FROM album WHERE id = ?', args: [id] },
				...data.tracks.map((t, position) =>
					onlyIf(
						memberIds.has(t.id)
							? repositionStatement(id, t.id, position, t.title.trim(), now, userId)
							: attachStatement(id, t.id, position, t.title.trim(), now, userId),
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
		// `createAlbum`. Best-effort: the original error is the one to report.
		await restore().catch((cleanup) =>
			console.error('[albums] could not restore album', id, cleanup)
		);
		throw e;
	}

	// Nothing was written unless the last statement was: say why.
	if (results[results.length - 1].rowsAffected !== 1) {
		const found = results[0].rows[0]?.updated_at;
		if (found === undefined) return refused(GONE_REFUSAL);
		// Still at `version`: a track it named was claimed elsewhere, or left the album.
		return refused(Number(found) === version ? ATTACH_REFUSAL : STALE_REFUSAL);
	}

	// The left-out tracks are unattached now, out of every page's sight; delete
	// them, conditional on staying so (a form that has since claimed one keeps
	// it). Rows first, files after: a failed delete leaves an orphan the sweeps
	// remove, never a row pointing at nothing.
	if (removed.length > 0) {
		const deleted = await db
			.delete(track)
			.where(and(inArray(track.id, removed), isNull(track.albumId)))
			.returning({ url: track.url });
		await deleteTrackObjects(deleted);
	}

	await purgeArchiveCache();
	return { ok: true, id };
}

/**
 * Delete an album: its track rows cascade with it, then their stored files
 * are removed (best-effort, see `deleteTrackObjects`). With `proposedOnly`,
 * only an album still awaiting review is deleted — the review queue's
 * reject, which must never discard an album an approval has just vetted.
 * With `version` (its `updated_at` in ms, as the edit page read it), only an
 * album still at that version is deleted, so a delete from an out-of-date
 * page can't take tracks it never showed. Returns whether one was deleted.
 */
export async function deleteAlbum(
	id: number,
	{ proposedOnly = false, version }: { proposedOnly?: boolean; version?: number } = {}
): Promise<boolean> {
	// No album is at a version that isn't a whole number of ms (a form sent none).
	if (version !== undefined && !Number.isSafeInteger(version)) return false;
	// One write transaction, so the files noted are exactly those of the track
	// rows the delete takes with it, even with an edit landing at the same time.
	const [tracks, deleted] = await client.batch(
		[
			{ sql: 'SELECT url FROM track WHERE album_id = ?', args: [id] },
			{
				sql: `DELETE FROM album WHERE id = ?${proposedOnly ? ' AND proposed_addition = 1' : ''}${version === undefined ? '' : ' AND updated_at = ?'} RETURNING proposed_addition`,
				args: version === undefined ? [id] : [id, version]
			}
		],
		'write'
	);
	if (deleted.rows.length === 0) return false;

	await deleteTrackObjects(tracks.rows.map((row) => ({ url: String(row.url) })));
	// An album still under review was never in the public blob.
	if (!Number(deleted.rows[0].proposed_addition)) await purgeArchiveCache();
	return true;
}

/** Albums with their event title flattened in, narrowed by `where`, newest first (undated last). */
function selectAlbums(where: SQL | undefined) {
	return db
		.select({ ...getTableColumns(album), event: event.title })
		.from(album)
		.leftJoin(event, eq(album.eventId, event.id))
		.where(where)
		.orderBy(desc(album.date), desc(album.id));
}

/**
 * The tracks of every album `where` matches, in play order. Filtered through
 * the same album condition rather than an id list, so the two queries run
 * together and a long list never meets SQLite's bound-parameter limit.
 */
function selectTracks(where: SQL | undefined) {
	return db
		.select(getTableColumns(track))
		.from(track)
		.innerJoin(album, eq(track.albumId, album.id))
		.where(where)
		.orderBy(track.albumId, track.position, track.id);
}

/** Group `tracks` under their albums, keeping each album's play order. */
function withTracks<T extends { id: number }>(
	albums: T[],
	tracks: Track[]
): (T & { tracks: Track[] })[] {
	const byAlbum = new Map<number, Track[]>();
	for (const row of tracks) {
		if (row.albumId === null) continue;
		const list = byAlbum.get(row.albumId) ?? [];
		list.push(row);
		byAlbum.set(row.albumId, list);
	}
	return albums.map((a) => ({ ...a, tracks: byAlbum.get(a.id) ?? [] }));
}

async function loadAlbums(where: SQL | undefined): Promise<AlbumWithMeta[]> {
	const [albums, tracks] = await Promise.all([selectAlbums(where), selectTracks(where)]);
	return withTracks(albums, tracks);
}

/** One album with its event title and its tracks in play order; null when there is none. */
export async function loadAlbum(id: number): Promise<AlbumWithMeta | null> {
	return (await loadAlbums(eq(album.id, id)))[0] ?? null;
}

/** Every album, vetted or not, newest first (undated last), each with its tracks in order. */
export function listAlbums(): Promise<AlbumWithMeta[]> {
	return loadAlbums(undefined);
}

/** Albums awaiting review, newest first, with their tracks. */
export function listProposedAlbums(): Promise<AlbumWithMeta[]> {
	return loadAlbums(eq(album.proposedAddition, true));
}
