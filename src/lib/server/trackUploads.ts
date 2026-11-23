import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { stampInsert } from './db/audit';
import { track, type Track } from './db/schema';
import { deleteScan, fetchObject, keyFromUrl, urlForKey } from './scans';
import { parseTrackKey, verifyTrackTicket } from './trackKeys';
import { titleFromFileName } from '#lib/albums/format.ts';
import { MAX_TRACK_BYTES, MAX_TRACK_SECONDS, MAX_TRACK_TITLE } from '#lib/albums/limits.ts';
import type { UploadedTrack } from '#lib/albums/types.ts';
import { AUDIO_TYPE_NAMES, sniffAudio, type ReadRange } from '#lib/audioType.ts';

/**
 * The upload side of albums. A track goes straight from the browser to the
 * bucket with one presigned PUT (see ./scans `uploadTarget`), then is
 * *finalized*: the server reads back the start of what landed, checks it is
 * the audio it was issued for, and records a `track` row with no album yet.
 * A form later attaches finalized tracks to an album (see ./albums).
 *
 * Only signed-in keepers upload tracks, so every upload is a keeper's own:
 * the key sits at the bucket root and the row is stamped with who finalized
 * it, which is what `ownsTrack` reads.
 *
 * Unlike a photograph, a track is never read back whole. It can run to a
 * gigabyte, far more than a function should hold, and nothing is derived
 * from its contents: the format is judged from its first bytes (and those
 * after any ID3 tag), its size from the bucket's own count. The URL fixes the
 * type and exact size, so whatever bytes end up stored are served as that
 * audio type and no other. That URL can be PUT again until it lapses, so
 * bytes other than those finalized could replace them within UPLOAD_URL_TTL_S;
 * they would still only ever be served as audio, which is the property that
 * matters on a public host.
 */

/** How long an issued upload URL stays good. Asked for just before its PUT, as for photographs. */
export const UPLOAD_URL_TTL_S = 300;

/** A refusal the uploader should see, with the HTTP status to answer it with. */
export class TrackUploadError extends Error {
	constructor(
		readonly status: 400 | 403 | 404 | 409 | 413 | 415,
		message: string
	) {
		super(message);
		this.name = 'TrackUploadError';
	}
}

/** Whether `userId` may attach or delete this track row: only one they finalized themselves. */
export function ownsTrack(row: Pick<Track, 'createdBy'>, userId: string): boolean {
	return row.createdBy === userId;
}

/** A track row as the uploader and the edit form read it. */
export function toUploadedTrack(row: Track): UploadedTrack {
	return {
		id: row.id,
		title: row.title,
		url: row.url,
		type: row.type,
		bytes: row.bytes,
		duration: row.duration,
		originalName: row.originalName
	};
}

/**
 * Delete the stored object behind each track row. Best-effort, like the rest
 * of the cleanup in ./uploads: a storage hiccup must not fail the write that
 * triggered it, and the sweeps pick up anything left behind.
 */
export async function deleteTrackObjects(rows: Pick<Track, 'url'>[]): Promise<void> {
	for (const row of rows) {
		const key = keyFromUrl(row.url);
		if (!key) continue;
		try {
			await deleteScan(key);
		} catch (e) {
			console.error('[trackUploads] object cleanup failed', key, e);
		}
	}
}

/** Read the first `length` bytes of a body, then drop the rest of it unread. */
async function readPrefix(body: ReadableStream<Uint8Array> | null, length: number) {
	if (!body) return new Uint8Array(0);
	const reader = body.getReader();
	const out = new Uint8Array(length);
	let filled = 0;
	try {
		while (filled < length) {
			const { done, value } = await reader.read();
			if (done) break;
			const take = Math.min(value.byteLength, length - filled);
			out.set(value.subarray(0, take), filled);
			filled += take;
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
	return out.subarray(0, filled);
}

/**
 * Ranged reads of one stored object, for `sniffAudio`, and its total size as
 * the bucket reports it (null until the first read, or when the object isn't
 * there). A store that ignores the range and sends the whole object is read
 * only as far as asked, then cut off.
 */
function objectReader(key: string): { read: ReadRange; size: () => number | null } {
	let size: number | null = null;
	const read: ReadRange = async (start, length) => {
		if (size !== null && start >= size) return new Uint8Array(0);
		const res = await fetchObject(key, { start, end: start + length - 1 });
		if (!res) throw new TrackUploadError(409, 'The track has not finished uploading — try again');
		if (res.status === 416) {
			// Past the end: of an empty object at the first read, else of the file.
			await res.body?.cancel().catch(() => {});
			if (size === null) size = 0;
			return new Uint8Array(0);
		}
		if (res.status === 206) {
			const total = /^bytes \d+-\d+\/(\d+)$/.exec(res.headers.get('content-range') ?? '')?.[1];
			if (!total) {
				await res.body?.cancel().catch(() => {});
				throw new Error(`Unreadable Content-Range reading ${key}`);
			}
			size = Number(total);
			return readPrefix(res.body, length);
		}
		// A 200: the whole object, from its first byte.
		size = Number(res.headers.get('content-length') ?? NaN);
		const bytes = await readPrefix(res.body, start + length);
		return bytes.subarray(start);
	};
	return { read, size: () => size };
}

/** The device's file name, tidied for storage (see `cleanName` in ./imageUploads); null when there is none. */
function cleanName(name: string, max = 255): string | null {
	const cleaned = name
		.toWellFormed()
		.replace(/[\p{Cc}\p{Bidi_Control}]/gu, '')
		.trim();
	return Array.from(cleaned).slice(0, max).join('').trimEnd() || null;
}

/** A declared length kept only when it reads as one. */
function plausibleDuration(value: unknown): number | null {
	return typeof value === 'number' &&
		Number.isFinite(value) &&
		value > 0 &&
		value <= MAX_TRACK_SECONDS
		? value
		: null;
}

async function trackByUrl(url: string): Promise<Track | undefined> {
	return db.select().from(track).where(eq(track.url, url)).get();
}

/**
 * Record a track the browser has uploaded (see `TrackFinalizeRequest`):
 * check the ticket, read back the start of the stored object, and insert an
 * unattached `track` row titled after its file name.
 *
 * Refusals, as `TrackUploadError`:
 *  - 400/403: a key that isn't this layout, or a ticket that isn't this
 *    keeper's — nothing is touched, since the object isn't theirs to delete;
 *  - 409: the object isn't there yet — kept, so the uploader can retry;
 *  - 413/415: what landed is empty, too large, or not the audio its key
 *    names — the object is deleted first.
 * Storage and database failures are thrown as they are (a 500) and delete
 * nothing, so a retry can still succeed.
 *
 * Idempotent on the key: finalizing it again answers with the row already
 * recorded, to the keeper who recorded it.
 */
export async function finalizeTrack(body: unknown, userId: string): Promise<UploadedTrack> {
	const fields: Record<string, unknown> =
		typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
	const parsed = parseTrackKey(fields.key);
	if (!parsed) throw new TrackUploadError(400, 'Not an upload the archive issued');
	if (typeof fields.name !== 'string') throw new TrackUploadError(400, 'Expected a file name');
	if (!verifyTrackTicket(userId, parsed.key, fields.ticket)) {
		throw new TrackUploadError(403, 'Forbidden: not your upload');
	}

	const url = urlForKey(parsed.key);
	const claim = (row: Track) => {
		if (!ownsTrack(row, userId)) throw new TrackUploadError(403, 'Forbidden: not your upload');
		return toUploadedTrack(row);
	};
	// A retry (a dropped response, a double submit) gets the row the first call recorded.
	const existing = await trackByUrl(url);
	if (existing) return claim(existing);

	const refuse = async (status: 413 | 415, message: string) => {
		await deleteTrackObjects([{ url }]);
		return new TrackUploadError(status, message);
	};

	const object = objectReader(parsed.key);
	const sniffed = await sniffAudio(object.read);
	const size = object.size();
	if (size === null || !Number.isSafeInteger(size) || size === 0 || size > MAX_TRACK_BYTES) {
		throw await refuse(413, 'The track is empty or too large');
	}
	if ('refused' in sniffed) throw await refuse(415, sniffed.refused);
	if (sniffed.type !== parsed.type) {
		throw await refuse(
			415,
			`The file is ${AUDIO_TYPE_NAMES[sniffed.type]}, not the ${AUDIO_TYPE_NAMES[parsed.type]} it was uploaded as`
		);
	}

	const originalName = cleanName(fields.name);
	// A concurrent finalize of the same key may have inserted first; the unique
	// index on `url` lets exactly one row land, and both read it back.
	await db
		.insert(track)
		.values({
			albumId: null,
			title: Array.from(titleFromFileName(originalName ?? ''))
				.slice(0, MAX_TRACK_TITLE)
				.join(''),
			url,
			type: parsed.type,
			bytes: size,
			duration: plausibleDuration(fields.duration),
			originalName,
			...stampInsert(userId)
		})
		.onConflictDoNothing({ target: track.url });
	const row = await trackByUrl(url);
	if (!row) throw new Error(`Track row for ${url} vanished after insert`);
	return claim(row);
}

/**
 * Delete an uploaded track no album has claimed yet — the uploader's remove
 * button — with its stored object. Refuses (without touching anything) an
 * unknown id, someone else's track, and one already in an album, in that
 * order, so nobody learns anything about a track that isn't theirs.
 */
export async function deleteUnattachedTrack(
	id: number,
	userId: string
): Promise<'deleted' | 'not-found' | 'forbidden' | 'attached'> {
	const row = await db.select().from(track).where(eq(track.id, id)).get();
	if (!row) return 'not-found';
	if (!ownsTrack(row, userId)) return 'forbidden';
	if (row.albumId !== null) return 'attached';

	// Conditional on still being unattached: a form saved since the read above
	// may have just claimed it.
	const deleted = await db
		.delete(track)
		.where(and(eq(track.id, id), isNull(track.albumId)))
		.returning({ url: track.url });
	if (deleted.length === 0) {
		const still = await db.select({ id: track.id }).from(track).where(eq(track.id, id)).get();
		return still ? 'attached' : 'not-found';
	}
	// Row first, object after: a failed delete leaves an orphan the sweep removes.
	await deleteTrackObjects(deleted);
	return 'deleted';
}
