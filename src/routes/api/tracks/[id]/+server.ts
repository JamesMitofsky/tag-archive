import { error } from '@sveltejs/kit';
import { idSchema } from '#lib/schemas.ts';
import { deleteUnattachedTrack } from '#lib/server/trackUploads.ts';
import type { RequestHandler } from './$types';

// The uploader's remove button: discard a track uploaded in this session but
// not yet saved into an album. Tracks already in an album are removed by
// saving the album without them (see #lib/server/albums), never from here.

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return Response.json({ message: 'Sign in to upload tracks.' }, { status: 401 });
	}

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Track not found');

	const outcome = await deleteUnattachedTrack(id.data, locals.user.id);
	if (outcome === 'not-found') throw error(404, 'Track not found');
	if (outcome === 'forbidden') throw error(403, 'Forbidden: not your upload');
	if (outcome === 'attached') {
		throw error(409, 'This track is part of a saved album; remove it there');
	}
	return Response.json({ success: true });
};
