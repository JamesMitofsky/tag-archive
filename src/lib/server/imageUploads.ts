import { json, type Cookies } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { stampInsert } from './db/audit';
import { image, type Image } from './db/schema';
import { readDraft, submissionPrefix } from './drafts';
import { parseImageKeys, type ParsedImageKeys } from './imageKeys';
import { parseImageMetadata, type ParsedImageMetadata } from './imageMetadata';
import { sniffImageType, type ImageType } from './imageType';
import { deleteScan, fetchObject, keyFromUrl, urlForKey } from './scans';
import { webpDimensions } from './webpDimensions';
import type { UploadedImage } from '$lib/images/types';

/**
 * The upload side of image sets: who may touch which uploaded photograph, and
 * the limits every upload is held to. A photograph is uploaded straight to the
 * bucket with presigned PUTs (see ./scans `uploadTarget`), then *finalized*:
 * the server reads back what landed, checks it, and records an `image` row
 * with no set yet. A form later attaches finalized images to a set (see
 * ./imageSets). Finalizing and deleting live here; attaching lives there.
 */

/** Largest original accepted: a full-resolution phone photo or a camera JPEG with room to spare. */
export const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024;
/** Largest WebP display copy accepted. A 2560px photo encodes to well under 2 MB. */
export const MAX_DISPLAY_BYTES = 8 * 1024 * 1024;
/** Longest edge of a stored display copy, as the uploader downscales it. */
export const MAX_DISPLAY_DIM = 2560;
/**
 * How long an issued upload URL stays good. The bucket checks expiry when a PUT
 * starts, not when it ends, and the uploader asks for each URL just before its
 * PUT (a retry asks again), so this only needs to cover that gap plus clock
 * skew. Kept short because a URL can be re-PUT until it lapses: the window in
 * which an uploader could swap a display copy for other bytes of the same size
 * after it was finalized.
 */
export const UPLOAD_URL_TTL_S = 300;

/**
 * Whose uploads a request may touch: a signed-in keeper (uploads at the bucket
 * root, rows attributed to them), or an anonymous contributor's draft session
 * (uploads under `submissions/<draft>/`, rows unattributed) — see
 * $lib/server/drafts.
 */
export type UploadOwner = { kind: 'keeper'; userId: string } | { kind: 'draft'; prefix: string };

/** The key prefix an owner's uploads are stored under. */
export function ownerPrefix(owner: UploadOwner): string {
	return owner.kind === 'keeper' ? '' : owner.prefix;
}

/**
 * The owner a request uploads as: keeper when `locals.user`; draft when
 * `locals.pass` and a valid draft cookie (`readDraft`); null otherwise (answer
 * 401 locked). The same two uploaders /api/scans admits. Used by every
 * /api/images endpoint and by the /contribute/images action.
 */
export function requestOwner(event: { locals: App.Locals; cookies: Cookies }): UploadOwner | null {
	if (event.locals.user) return { kind: 'keeper', userId: event.locals.user.id };
	// The gate has already refused a pass-less API call; this keeps the rule
	// legible, and covers form actions, which the gate lets through.
	if (!event.locals.pass) return null;
	const draft = readDraft(event.cookies);
	return draft ? { kind: 'draft', prefix: submissionPrefix(draft.id) } : null;
}

/** 401 the uploader recognizes as "tap the tag again to keep going", as /api/scans answers it. */
export function lockedResponse(): Response {
	return json({ message: 'Visit the Cube to open the Archive.', code: 'locked' }, { status: 401 });
}

/**
 * Whether `owner` may attach or delete this image row, setting aside whether it
 * is still unattached (callers check `setId` themselves, so they can tell the
 * two refusals apart).
 *
 *  - a keeper: only images they finalized themselves;
 *  - a draft: only unattributed images stored under its own prefix — the draft
 *    cookie is the whole proof of ownership, as for scans.
 */
export function ownsImage(
	row: Pick<Image, 'createdBy' | 'originalUrl'>,
	owner: UploadOwner
): boolean {
	if (owner.kind === 'keeper') return row.createdBy === owner.userId;
	return row.createdBy === null && !!keyFromUrl(row.originalUrl)?.startsWith(owner.prefix);
}

/** A refusal the uploader should see, with the HTTP status to answer it with. */
export class ImageUploadError extends Error {
	constructor(
		readonly status: 400 | 403 | 404 | 409 | 413 | 415 | 422,
		message: string
	) {
		super(message);
		this.name = 'ImageUploadError';
	}
}

/** An image row as the uploader and the edit form read it. */
export function toUploadedImage(row: Image): UploadedImage {
	return {
		id: row.id,
		url: row.url,
		originalUrl: row.originalUrl,
		width: row.width,
		height: row.height,
		capturedAt: row.capturedAt
	};
}

/**
 * Delete the two stored objects behind each image row. Best-effort, like the
 * rest of the cleanup in ./uploads: a storage hiccup must not fail the write
 * that triggered it, and the sweeps pick up anything left behind.
 */
export async function deleteImageObjects(
	rows: Pick<Image, 'url' | 'originalUrl'>[]
): Promise<void> {
	for (const row of rows) {
		for (const url of [row.url, row.originalUrl]) {
			const key = keyFromUrl(url);
			if (!key) continue;
			try {
				await deleteScan(key);
			} catch (e) {
				console.error('[imageUploads] object cleanup failed', key, e);
			}
		}
	}
}

/**
 * Stop a body that won't be read. Canceling drops its connection, so the rest
 * is never transferred. Cleanup only: it never fails the caller.
 */
async function release(body: ReadableStream | null): Promise<void> {
	await body?.cancel().catch(() => {});
}

/**
 * Read a request or response body into memory, giving up (null) as soon as it
 * passes `cap` bytes: a declared `Content-Length` over the cap is refused
 * before a byte is read, and an undeclared or understated one is cut off
 * mid-stream. Either way no body larger than `cap` is ever buffered whole.
 */
export async function readCapped(
	message: { body: ReadableStream<Uint8Array> | null; headers: Headers },
	cap: number
): Promise<Uint8Array | null> {
	const declared = Number(message.headers.get('content-length') ?? NaN);
	if (declared > cap) {
		await release(message.body);
		return null;
	}
	if (!message.body) return new Uint8Array(0);

	const reader = message.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		length += value.byteLength;
		if (length > cap) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

/**
 * How much of an original the first read asks for: plenty to sniff its type,
 * and the whole of a small file, which then needn't be fetched twice.
 */
const HEAD_BYTES = 64 * 1024;

/** Longest original file name kept, in characters. */
const MAX_NAME_LENGTH = 255;

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

const ORIGINAL_SIZE_REFUSAL = `The photograph is empty or larger than ${megabytes(MAX_ORIGINAL_BYTES)}`;

const notFinished = (what: string) =>
	new ImageUploadError(409, `The ${what} has not finished uploading — try again`);

const notYours = () => new ImageUploadError(403, 'Forbidden: not your upload');

async function imageByOriginalUrl(originalUrl: string): Promise<Image | undefined> {
	return db.select().from(image).where(eq(image.originalUrl, originalUrl)).get();
}

/** Whether the upload stored under `originalKey` has been finalized into an image row. */
export async function isFinalized(originalKey: string): Promise<boolean> {
	const row = await db
		.select({ id: image.id })
		.from(image)
		.where(eq(image.originalUrl, urlForKey(originalKey)))
		.get();
	return !!row;
}

/** An existing row, as `owner` may have it back. */
function claim(row: Image, owner: UploadOwner): UploadedImage {
	if (!ownsImage(row, owner)) throw notYours();
	return toUploadedImage(row);
}

/**
 * The original's first bytes and its total size, from one ranged read, so a
 * wrong type or size is refused before anything large is downloaded. `whole`
 * holds the entire object when that read already returned all of it. `size`
 * is Infinity when the store ignored the range and sent more than an original
 * may hold (its exact size unread). Null when there is no such object.
 */
async function readOriginalHead(
	key: string
): Promise<{ head: Uint8Array; size: number; whole: Uint8Array | null } | null> {
	const res = await fetchObject(key, { start: 0, end: HEAD_BYTES - 1 });
	if (!res) return null;

	if (res.status === 416) {
		// A range against an empty object (see `fetchObject`).
		await release(res.body);
		const empty = new Uint8Array(0);
		return { head: empty, size: 0, whole: empty };
	}

	if (res.status === 206) {
		const range = /^bytes 0-\d+\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
		if (!range) {
			await release(res.body);
			throw new Error(
				`Unreadable Content-Range reading ${key}: ${res.headers.get('content-range')}`
			);
		}
		const size = Number(range[1]);
		const head = await readCapped(res, HEAD_BYTES);
		if (!head) throw new Error(`Ranged read of ${key} returned more than it asked for`);
		return { head, size, whole: head.length === size ? head : null };
	}

	// A 200: the store sent the whole object rather than the range.
	const whole = await readCapped(res, MAX_ORIGINAL_BYTES);
	if (!whole) return { head: new Uint8Array(0), size: Infinity, whole: null };
	return { head: whole, size: whole.length, whole };
}

/** A whole stored object, read with a byte cap. */
async function readObject(key: string, cap: number): Promise<Uint8Array | 'missing' | 'too-large'> {
	const res = await fetchObject(key);
	if (!res) return 'missing';
	if (res.status !== 200) {
		await release(res.body);
		throw new Error(`Unexpected ${res.status} reading ${key}`);
	}
	return (await readCapped(res, cap)) ?? 'too-large';
}

/** Why an original can't be kept, judged from its leading bytes and size; null when it can. */
function originalProblem(
	head: Uint8Array,
	size: number,
	type: ImageType
): [status: 413 | 415, message: string] | null {
	if (size === 0 || size > MAX_ORIGINAL_BYTES) return [413, ORIGINAL_SIZE_REFUSAL];
	const sniffed = sniffImageType(head);
	if (!sniffed) return [415, 'Expected a JPEG, PNG, WebP, GIF, or HEIC photograph'];
	// The key's extension names the type the upload URL was issued (and signed) for.
	if (sniffed !== type) return [415, 'The photograph is not the type it was uploaded as'];
	return null;
}

/** The device's file name for an original, tidied for storage; null when there is none. */
function cleanName(name: string): string | null {
	// Control characters have no place in a name a page or a log will show, nor
	// do bidi controls, which can make `IMG_<RLO>gpj.exe` read as `IMG_exe.jpg`.
	// A lone surrogate (JSON allows one) becomes U+FFFD here rather than
	// silently in the database.
	const cleaned = name
		.toWellFormed()
		.replace(/[\p{Cc}\p{Bidi_Control}]/gu, '')
		.trim();
	// Cut by code point, so a long name never ends in half a surrogate pair.
	return Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('').trimEnd() || null;
}

/**
 * The first EXIF or XMP chunk of a WebP, by its FourCC; null when there is
 * none. The display copy is the public file, and the uploader's encoder (a
 * canvas) writes neither, so one that carries them is not what the uploader
 * made — and could publish the GPS and device details an original's metadata
 * is kept private for. Walks to the last byte rather than the RIFF's declared
 * size, since whoever reads a published file may look past it.
 */
function webpMetadataChunk(bytes: Uint8Array): string | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	// Every step advances at least a chunk header, so this always terminates.
	for (let at = 12; at + 8 <= bytes.length;) {
		const fourCC = String.fromCharCode(...bytes.subarray(at, at + 4));
		if (fourCC === 'EXIF' || fourCC === 'XMP ') return fourCC;
		const size = view.getUint32(at + 4, true);
		at += 8 + size + (size % 2); // chunks are padded to an even size
	}
	return null;
}

/**
 * Metadata never decides whether a photograph is kept: the parser promises not
 * to throw, and should it break that promise on some camera's bytes, the
 * upload goes ahead undated rather than being lost.
 */
async function readMetadata(bytes: Uint8Array): Promise<ParsedImageMetadata> {
	try {
		return await parseImageMetadata(bytes);
	} catch (e) {
		console.error('[imageUploads] metadata parse failed', e);
		return { capturedAt: null, capturedOffset: null, metadata: null };
	}
}

/**
 * Record a photograph the browser has uploaded (see `FinalizeRequest`): read
 * back both stored objects, check them, and insert an unattached `image` row.
 *
 * Nothing the browser declared is trusted. The original must sniff as the
 * type its key names and fit MAX_ORIGINAL_BYTES; the display copy must be a
 * WebP within MAX_DISPLAY_BYTES and MAX_DISPLAY_DIM, carrying no EXIF or XMP
 * (it is the copy pages publish). Cheap checks run first —
 * the original's leading bytes, then the display copy — so a bad upload is
 * refused before its original is downloaded in full.
 *
 * Refusals, as `ImageUploadError`:
 *  - 400/403: keys that aren't this layout, or aren't the owner's — nothing is
 *    touched, since the objects aren't the caller's to delete;
 *  - 409: an object isn't there yet — kept, so the uploader can retry;
 *  - 413/415/422: what landed is unusable — both objects are deleted first.
 * Storage and database failures are thrown as they are (a 500) and delete
 * nothing, so a retry can still succeed.
 *
 * Idempotent on the original's URL: finalizing the same keys again answers
 * with the row already recorded, to its owner.
 */
export async function finalizeImage(body: unknown, owner: UploadOwner): Promise<UploadedImage> {
	const fields: Record<string, unknown> =
		typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
	const keys = parseImageKeys({ originalKey: fields.originalKey, displayKey: fields.displayKey });
	if (!keys) throw new ImageUploadError(400, 'Not an upload the archive issued');
	if (typeof fields.name !== 'string') throw new ImageUploadError(400, 'Expected a file name');
	// The key's prefix is whose upload it is: a draft's own space, or the root
	// for keepers — so a draft can't finalize a keeper's upload, nor a keeper
	// a contributor's.
	if (keys.prefix !== ownerPrefix(owner)) throw notYours();

	const originalUrl = urlForKey(keys.originalKey);
	const displayUrl = urlForKey(keys.displayKey);

	// A retry (a dropped response, a double submit) gets the row the first call recorded.
	const existing = await imageByOriginalUrl(originalUrl);
	if (existing) return claim(existing, owner);

	const refuse = (status: 413 | 415 | 422, message: string) =>
		discard(keys).then(() => new ImageUploadError(status, message));

	const head = await readOriginalHead(keys.originalKey);
	if (!head) throw notFinished('photograph');
	const headProblem = originalProblem(head.head, head.size, keys.originalType);
	if (headProblem) throw await refuse(...headProblem);

	const display = await readObject(keys.displayKey, MAX_DISPLAY_BYTES);
	if (display === 'missing') throw notFinished('display copy');
	if (display === 'too-large') {
		throw await refuse(413, `The display copy is larger than ${megabytes(MAX_DISPLAY_BYTES)}`);
	}
	const dimensions = sniffImageType(display) === 'image/webp' ? webpDimensions(display) : null;
	if (!dimensions) throw await refuse(415, 'The display copy is not a WebP image');
	if (Math.max(dimensions.width, dimensions.height) > MAX_DISPLAY_DIM) {
		throw await refuse(422, `The display copy is larger than ${MAX_DISPLAY_DIM} pixels`);
	}
	if (webpMetadataChunk(display)) {
		throw await refuse(422, 'The display copy must not carry EXIF or XMP metadata');
	}

	const original = head.whole ?? (await readObject(keys.originalKey, MAX_ORIGINAL_BYTES));
	if (original === 'missing') throw notFinished('photograph');
	if (original === 'too-large') throw await refuse(413, ORIGINAL_SIZE_REFUSAL);
	// A signed URL fixes the original's size and type but can be PUT again
	// until it expires, so judge the bytes actually recorded, not just the head.
	const problem = originalProblem(original, original.length, keys.originalType);
	if (problem) throw await refuse(...problem);

	const { capturedAt, capturedOffset, metadata } = await readMetadata(original);

	// A concurrent finalize of the same keys may have inserted first; the unique
	// index on `original_url` lets exactly one row land, and both read it back.
	await db
		.insert(image)
		.values({
			setId: null,
			url: displayUrl,
			originalUrl,
			originalType: keys.originalType,
			originalName: cleanName(fields.name),
			originalBytes: original.length,
			bytes: display.length,
			width: dimensions.width,
			height: dimensions.height,
			capturedAt,
			capturedOffset,
			metadata,
			...stampInsert(owner.kind === 'keeper' ? owner.userId : null)
		})
		.onConflictDoNothing({ target: image.originalUrl });
	const row = await imageByOriginalUrl(originalUrl);
	if (!row) throw new Error(`Image row for ${originalUrl} vanished after insert`);
	return claim(row, owner);
}

/** Best-effort removal of an upload's two objects, as its refusal leaves them unusable. */
function discard(keys: ParsedImageKeys): Promise<void> {
	return deleteImageObjects([
		{ url: urlForKey(keys.displayKey), originalUrl: urlForKey(keys.originalKey) }
	]);
}

/**
 * Delete an uploaded image that no set has claimed yet — the uploader's
 * remove button — with its two stored objects. Refuses (without touching
 * anything) an unknown id, someone else's image, and one already attached to
 * a set, in that order, so a stranger learns nothing about another's image.
 */
export async function deleteUnattachedImage(
	id: number,
	owner: UploadOwner
): Promise<'deleted' | 'not-found' | 'forbidden' | 'attached'> {
	const row = await db.select().from(image).where(eq(image.id, id)).get();
	if (!row) return 'not-found';
	if (!ownsImage(row, owner)) return 'forbidden';
	if (row.setId !== null) return 'attached';

	// Conditional on still being unattached: a form saved since the read above
	// may have just claimed it.
	const deleted = await db
		.delete(image)
		.where(and(eq(image.id, id), isNull(image.setId)))
		.returning({ url: image.url, originalUrl: image.originalUrl });
	if (deleted.length === 0) {
		const still = await db.select({ id: image.id }).from(image).where(eq(image.id, id)).get();
		return still ? 'attached' : 'not-found';
	}
	// Row first, objects after: a failed object delete leaves an orphan the
	// sweep removes, never a row pointing at nothing.
	await deleteImageObjects(deleted);
	return 'deleted';
}
