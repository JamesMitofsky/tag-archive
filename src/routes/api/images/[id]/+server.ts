import { error, json } from '@sveltejs/kit';
import { idSchema } from '$lib/schemas';
import { deleteUnattachedImage, lockedResponse, requestOwner } from '$lib/server/imageUploads';
import type { RequestHandler } from './$types';

// The uploader's remove button: discard a photograph uploaded in this session
// but not yet saved into a set. Images already in a set are removed by saving
// the set without them (see $lib/server/imageSets), never from here.

export const DELETE: RequestHandler = async ({ params, locals, cookies }) => {
	const owner = requestOwner({ locals, cookies });
	if (!owner) return lockedResponse();

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Image not found');

	const outcome = await deleteUnattachedImage(id.data, owner);
	if (outcome === 'not-found') throw error(404, 'Image not found');
	if (outcome === 'forbidden') throw error(403, 'Forbidden: not your upload');
	if (outcome === 'attached') {
		throw error(409, 'This photograph is part of a saved image set; remove it there');
	}
	return json({ success: true });
};
