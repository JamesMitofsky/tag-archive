import { error, json } from '@sveltejs/kit';
import type { DisplayUploadGrant, OriginalUploadGrant } from '$lib/images/types';
import { readDraft } from '$lib/server/drafts';
import { imageKeys, parseOriginalKey } from '$lib/server/imageKeys';
import { isImageType } from '$lib/server/imageType';
import {
	isFinalized,
	lockedResponse,
	MAX_DISPLAY_BYTES,
	MAX_ORIGINAL_BYTES,
	ownerPrefix,
	requestOwner,
	UPLOAD_URL_TTL_S
} from '$lib/server/imageUploads';
import { consume, LIMITS } from '$lib/server/rateLimit';
import { uploadTarget } from '$lib/server/scans';
import { sign, verify } from '$lib/server/signing';
import type { RequestHandler } from './$types';

// Upload URLs for photographs (see $lib/server/imageUploads). Photographs go
// straight from the browser to the bucket, which has no per-request access
// control of its own, so this is their write gate — the same two uploaders as
// /api/scans, under the same rules:
//
//  - a signed-in keeper: keys at the bucket root;
//  - an anonymous visitor on /contribute: needs an open access pass and a
//    draft session, and is rate-limited; keys under `submissions/<draft>/`.
//
// Each URL is issued for one object's exact type and byte size (see
// `presignPut`), so the browser asks twice per photograph: for the original
// before it starts encoding, then for the WebP display copy once its size is
// known. The second request presents a ticket from the first, which proves
// the original was issued to this caller — and charged to their allowance, so
// display URLs need no charge of their own.

export const POST: RequestHandler = async ({ request, locals, cookies, getClientAddress }) => {
	const owner = requestOwner({ locals, cookies });
	if (!owner) return lockedResponse();
	const prefix = ownerPrefix(owner);

	const body = await request.json().catch(() => null);
	const fields: Record<string, unknown> =
		typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

	if (fields.object === 'display') {
		const keys = parseOriginalKey(fields.originalKey);
		if (!keys) throw error(400, 'Not an upload the archive issued');
		if (keys.prefix !== prefix) throw error(403, 'Forbidden: not your upload');
		const { ticket } = fields;
		if (typeof ticket !== 'string' || !verify('image-display', keys.originalKey, ticket)) {
			throw error(403, 'Forbidden: not your upload');
		}
		const size = byteSize(fields.size, MAX_DISPLAY_BYTES, 'The display copy');
		// The ticket never expires, so this is what stops a finalized display
		// copy — the one reviewers will see — being replaced through a fresh URL
		// afterwards. (A URL already issued lapses within UPLOAD_URL_TTL_S.)
		if (await isFinalized(keys.originalKey)) {
			throw error(409, 'This photograph has already been uploaded');
		}
		const grant: DisplayUploadGrant = {
			upload: await uploadTarget(keys.displayKey, 'image/webp', size, UPLOAD_URL_TTL_S)
		};
		return json(grant);
	}

	if (fields.object !== 'original') throw error(400, 'Expected an upload request');
	// The browser sniffed this from the file; finalize sniffs what actually landed.
	const { type } = fields;
	if (!isImageType(type)) throw error(415, 'Expected a JPEG, PNG, WebP, GIF, or HEIC image');
	const size = byteSize(fields.size, MAX_ORIGINAL_BYTES, 'The photograph');
	if (typeof fields.name !== 'string') throw error(400, 'Expected a file name');

	if (owner.kind === 'draft') {
		// `requestOwner` has just verified this cookie; its id is the subject
		// /api/scans charges. Same buckets on purpose: one allowance per visitor,
		// whatever they upload.
		const draft = readDraft(cookies);
		if (!draft) return lockedResponse();
		const allowed =
			(await consume('upload-ip', getClientAddress(), LIMITS.uploadPerIp)) &&
			(await consume('upload-draft', draft.id, LIMITS.uploadPerDraft));
		if (!allowed) throw error(429, 'Too many uploads — wait a little and try again');
	}

	const { originalKey, displayKey } = imageKeys(prefix, type);
	const grant: OriginalUploadGrant = {
		originalKey,
		displayKey,
		ticket: sign('image-display', originalKey),
		upload: await uploadTarget(originalKey, type, size, UPLOAD_URL_TTL_S)
	};
	return json(grant);
};

/** The exact byte size an upload URL is signed for, within `max`. */
function byteSize(value: unknown, max: number, what: string): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
		throw error(400, 'Expected a byte size');
	}
	if (value < 1 || value > max) throw error(413, `${what} is empty or too large`);
	return value;
}
