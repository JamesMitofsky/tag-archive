import { error, json } from '@sveltejs/kit';
import {
	finalizeImage,
	ImageUploadError,
	lockedResponse,
	requestOwner
} from '$lib/server/imageUploads';
import { readDraft } from '$lib/server/drafts';
import { consume, LIMITS } from '$lib/server/rateLimit';
import type { RequestHandler } from './$types';

// The last step of a photograph's upload (see $lib/server/imageUploads): the
// browser has PUT both objects straight to the bucket, and the server now
// reads them back, checks them and records an unattached image row. Same
// uploaders as /api/images/upload-url. Only an upload that URL issued (and
// charged) can be finalized, but until it is recorded every call re-reads the
// original, so an anonymous caller gets an allowance of its own here.

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const owner = requestOwner({ locals, cookies });
	if (!owner) return lockedResponse();

	if (owner.kind === 'draft') {
		// `requestOwner` has just verified this cookie.
		const draft = readDraft(cookies);
		if (!draft) return lockedResponse();
		if (!(await consume('finalize-draft', draft.id, LIMITS.finalizePerDraft))) {
			throw error(429, 'Too many uploads — wait a little and try again');
		}
	}

	const body = await request.json().catch(() => null);
	try {
		return json(await finalizeImage(body, owner));
	} catch (e) {
		// Refusals reach the uploader as their message; anything else is a 500.
		if (e instanceof ImageUploadError) throw error(e.status, e.message);
		throw e;
	}
};
