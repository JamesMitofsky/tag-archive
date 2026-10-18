import { error, json } from '@sveltejs/kit';
import {
	finalizeImage,
	ImageUploadError,
	lockedResponse,
	requestOwner
} from '$lib/server/imageUploads';
import type { RequestHandler } from './$types';

// The last step of a photograph's upload (see $lib/server/imageUploads): the
// browser has PUT both objects straight to the bucket, and the server now
// reads them back, checks them and records an unattached image row. Same
// uploaders as /api/images/upload-url; no rate-limit charge, since only an
// upload that URL issued (and charged) can be finalized.

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const owner = requestOwner({ locals, cookies });
	if (!owner) return lockedResponse();

	const body = await request.json().catch(() => null);
	try {
		return json(await finalizeImage(body, owner));
	} catch (e) {
		// Refusals reach the uploader as their message; anything else is a 500.
		if (e instanceof ImageUploadError) throw error(e.status, e.message);
		throw e;
	}
};
