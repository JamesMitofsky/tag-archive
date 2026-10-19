import { error, json } from '@sveltejs/kit';
import { readDraft, submissionPrefix } from '$lib/server/drafts';
import { sniffImageType } from '$lib/server/imageType';
import { MAX_SCAN_BYTES, SCAN_TOO_LARGE } from '$lib/scanner/limits';
import { consume, LIMITS } from '$lib/server/rateLimit';
import { deleteScan, keyFromUrl, uploadScan } from '$lib/server/scans';
import { referencedUrls } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

// Image uploads for artefact scans — the write gate in front of the bucket,
// which itself has no per-request access control. Two kinds of uploader:
//
//  - a signed-in keeper: uploads land at the bucket root, as before;
//  - an anonymous visitor on /contribute: needs an open access pass (the site
//    has been on their screen since they tapped the garden tag, see
//    $lib/access/pass) and a draft session (the tap, see $lib/server/drafts),
//    and is rate-limited; uploads land in that draft's private
//    `submissions/<draft>/` space.
// Under the platform's body limit, so an oversized scan gets this route's message (see $lib/scanner/limits).
const MAX_BYTES = MAX_SCAN_BYTES;

/** 401 the client recognises as "tap the tag again to keep going". */
const locked = () =>
	json({ message: 'Visit the Cube to open the Archive.', code: 'locked' }, { status: 401 });

export const POST: RequestHandler = async ({ request, locals, cookies, getClientAddress }) => {
	let prefix = '';
	if (!locals.user) {
		// The gate has already refused a pass-less call; this keeps the rule legible.
		const draft = readDraft(cookies);
		if (!locals.pass || !draft) return locked();
		const ip = getClientAddress();
		const allowed =
			(await consume('upload-ip', ip, LIMITS.uploadPerIp)) &&
			(await consume('upload-draft', draft.id, LIMITS.uploadPerDraft));
		if (!allowed) throw error(429, 'Too many uploads — wait a little and try again');
		prefix = submissionPrefix(draft.id);
	}

	// Refuse an oversized body before buffering it, when the size is declared.
	const declared = Number(request.headers.get('content-length'));
	if (declared > MAX_BYTES + 64 * 1024) throw error(413, SCAN_TOO_LARGE);

	const data = await request.formData();
	const file = data.get('file');
	if (!(file instanceof File)) throw error(400, 'No file provided');
	if (file.size === 0) throw error(413, 'Image is empty');
	if (file.size > MAX_BYTES) throw error(413, SCAN_TOO_LARGE);

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

	// A visitor may only discard their own draft's uploads. The draft cookie is
	// the proof of ownership; the pass that let this call through is the permission.
	if (!locals.user) {
		const draft = readDraft(cookies);
		if (!draft || !key.startsWith(submissionPrefix(draft.id))) {
			throw error(403, 'Forbidden: not your upload');
		}
	}

	// Only unattached transient uploads (draft scans) may be deleted here — never
	// an image a saved artefact uses, nor either object of a photograph (an
	// image row, set or not: those go through DELETE /api/images/[id]).
	if ((await referencedUrls([url])).has(url)) {
		throw error(403, 'Forbidden: Cannot delete an image that is in use');
	}

	await deleteScan(key);
	return json({ success: true });
};
