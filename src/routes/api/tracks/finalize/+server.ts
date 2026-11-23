import { error } from '@sveltejs/kit';
import { finalizeTrack, TrackUploadError } from '#lib/server/trackUploads.ts';
import type { RequestHandler } from './$types';

// The last step of a track's upload (see #lib/server/trackUploads): the
// browser has PUT the file straight to the bucket, and the server now reads
// back its first bytes, checks them and records an unattached track row.
// Signed-in keepers only, as for the upload URL.

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return Response.json({ message: 'Sign in to upload tracks.' }, { status: 401 });
	}
	const body = await request.json().catch(() => null);
	try {
		return Response.json(await finalizeTrack(body, locals.user.id));
	} catch (e) {
		// Refusals reach the uploader as their message; anything else is a 500.
		if (e instanceof TrackUploadError) throw error(e.status, e.message);
		throw e;
	}
};
