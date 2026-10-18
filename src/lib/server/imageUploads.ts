import type { Image } from './db/schema';
import { deleteScan, keyFromUrl } from './scans';
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
/** How long an issued upload URL stays good. */
export const UPLOAD_URL_TTL_S = 900;

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
