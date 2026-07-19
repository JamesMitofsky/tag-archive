import { error, json } from '@sveltejs/kit';
import { uploadScan } from '$lib/server/scans';
import type { RequestHandler } from './$types';

// Accept an uploaded image and push it to R2. Signed-in only — this handler is
// the write gate; the bucket itself has no per-request access control.
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — generous cap for a scanned image.

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to upload an image');

	const data = await request.formData();
	const file = data.get('file');
	if (!(file instanceof File)) throw error(400, 'No file provided');
	if (!file.type.startsWith('image/')) throw error(415, 'Expected an image');
	if (file.size === 0 || file.size > MAX_BYTES) throw error(413, 'Image is empty or too large');

	const { key, url } = await uploadScan(await file.arrayBuffer(), file.type);
	return json({ url, fileName: file.name || key });
};
