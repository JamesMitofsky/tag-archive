import { error } from '@sveltejs/kit';
import { readCapped } from '$lib/server/imageUploads';
import { putObject, usesUploadProxy, verifyProxyPut } from '$lib/server/scans';
import type { RequestHandler } from './$types';

// Local dev only: the upload proxy (see `usesUploadProxy` in
// $lib/server/scans). The browser PUTs here instead of straight to the store,
// and this stands in for the store's presigned URL by holding the PUT to the
// same terms: the HMAC in the query string, minted by /api/images/upload-url
// after its own checks, binds the key, type, exact size and expiry. Like a
// presigned URL, that signature is the whole authorization — no session check
// is needed here. (The access gate still wants a pass for /api/*, which the
// same-origin PUT carries in its cookies.)

export const PUT: RequestHandler = async ({ request, url }) => {
	// Off unless opted into: in production uploads never pass through a function.
	if (!usesUploadProxy()) throw error(404, 'Not found');

	const terms = verifyProxyPut(url.searchParams);
	if (!terms) throw error(403, 'This upload link is not valid or has expired');
	// The store would refuse an unsigned type the same way.
	if (request.headers.get('content-type') !== terms.contentType) {
		throw error(403, 'Content-Type does not match this upload link');
	}

	// Exactly the signed size: a declared larger body is refused unread, and an
	// undeclared one is cut off as soon as it runs over.
	const bytes = await readCapped(request, terms.size);
	if (!bytes || bytes.length !== terms.size) {
		throw error(400, `This upload link takes exactly ${terms.size} bytes`);
	}

	await putObject(terms.key, bytes, terms.contentType);
	return new Response(null, { status: 200 });
};
