import { error } from '@sveltejs/kit';
import { MAX_TRACK_BYTES } from '#lib/albums/limits.ts';
import type { TrackUploadGrant } from '#lib/albums/types.ts';
import { isAudioType, UNSUPPORTED_AUDIO } from '#lib/audioType.ts';
import { uploadTarget } from '#lib/server/scans.ts';
import { trackKey, trackTicket } from '#lib/server/trackKeys.ts';
import { UPLOAD_URL_TTL_S } from '#lib/server/trackUploads.ts';
import type { RequestHandler } from './$types';

// Upload URLs for album tracks (see #lib/server/trackUploads). Tracks go
// straight from the browser to the bucket, which has no per-request access
// control of its own, so this is their write gate: signed-in keepers only
// (listeners are never on `locals.user`, see #lib/roles). Each URL is issued
// for one exact type and byte size (see `presignPut`), and comes with a
// ticket that finalize asks for, so only the keeper it was issued to can
// record what lands under it.

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return Response.json({ message: 'Sign in to upload tracks.' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const fields: Record<string, unknown> =
		typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

	// The browser sniffed this from the file; finalize sniffs what actually landed.
	const { type, size, name } = fields;
	if (!isAudioType(type)) throw error(415, UNSUPPORTED_AUDIO);
	if (typeof size !== 'number' || !Number.isSafeInteger(size)) {
		throw error(400, 'Expected a byte size');
	}
	if (size < 1 || size > MAX_TRACK_BYTES) throw error(413, 'The track is empty or too large');
	if (typeof name !== 'string') throw error(400, 'Expected a file name');

	const key = trackKey(type);
	const grant: TrackUploadGrant = {
		key,
		ticket: trackTicket(locals.user.id, key),
		upload: await uploadTarget(key, type, size, UPLOAD_URL_TTL_S)
	};
	return Response.json(grant);
};
