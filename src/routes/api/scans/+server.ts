import { error, json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { artefact } from '$lib/server/db/schema';
import { freshDraft, readDraft, submissionPrefix } from '$lib/server/drafts';
import { sniffImageType } from '$lib/server/imageType';
import { consume, LIMITS } from '$lib/server/rateLimit';
import { deleteScan, keyFromUrl, uploadScan } from '$lib/server/scans';
import type { RequestHandler } from './$types';

// Image uploads for artefact scans — the write gate in front of the bucket,
// which itself has no per-request access control. Two kinds of uploader:
//
//  - a signed-in keeper: uploads land at the bucket root, as before;
//  - an anonymous visitor on /contribute: needs a fresh draft session (a
//    recent tap of the garden tag, see $lib/server/drafts) and is rate-limited; uploads
//    land in that draft's private `submissions/<draft>/` space.
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — generous cap for a scanned image.

/** 401 the client recognises as "tap the tag again to keep going". */
const locked = () =>
	json(
		{ message: 'Tap the tag in the garden again to keep going.', code: 'locked' },
		{ status: 401 }
	);

export const POST: RequestHandler = async ({ request, locals, cookies, getClientAddress }) => {
	let prefix = '';
	if (!locals.user) {
		const draft = freshDraft(cookies);
		if (!draft) return locked();
		const ip = getClientAddress();
		const allowed =
			(await consume('upload-ip', ip, LIMITS.uploadPerIp)) &&
			(await consume('upload-draft', draft.id, LIMITS.uploadPerDraft));
		if (!allowed) throw error(429, 'Too many uploads — wait a little and try again');
		prefix = submissionPrefix(draft.id);
	}

	// Refuse an oversized body before buffering it, when the size is declared.
	const declared = Number(request.headers.get('content-length'));
	if (declared > MAX_BYTES + 64 * 1024) throw error(413, 'Image is too large');

	const data = await request.formData();
	const file = data.get('file');
	if (!(file instanceof File)) throw error(400, 'No file provided');
	if (file.size === 0 || file.size > MAX_BYTES) throw error(413, 'Image is empty or too large');

	// The stored type comes from the bytes, never from what the client declared.
	const bytes = await file.arrayBuffer();
	const type = sniffImageType(new Uint8Array(bytes));
	if (!type) throw error(415, 'Expected a WebP, JPEG, PNG, GIF, or HEIC image');

	const { key, url } = await uploadScan(bytes, type, prefix);
	return json({ url, fileName: file.name || key });
};

export const DELETE: RequestHandler = async ({ request, locals, cookies }) => {
	const { url } = (await request.json().catch(() => ({}))) as { url?: string };
	if (!url || typeof url !== 'string') throw error(400, 'No URL provided');
	const key = keyFromUrl(url);
	if (!key) throw error(400, 'Not an uploaded image');

	// A visitor may only discard their own draft's uploads. Any validly signed
	// draft counts, fresh or not: ownership doesn't lapse with the tap.
	if (!locals.user) {
		const draft = readDraft(cookies);
		if (!draft || !key.startsWith(submissionPrefix(draft.id))) {
			throw error(403, 'Forbidden: not your upload');
		}
	}

	// Only unattached transient uploads (draft scans) may be deleted here — never
	// an image a saved artefact already uses.
	const existing = await db
		.select({ id: artefact.id })
		.from(artefact)
		.where(sql`exists (select 1 from json_each(${artefact.fileUrls}) where value = ${url})`)
		.get();
	if (existing) {
		throw error(403, 'Forbidden: Cannot delete an image that is attached to a saved artefact');
	}

	await deleteScan(key);
	return json({ success: true });
};
