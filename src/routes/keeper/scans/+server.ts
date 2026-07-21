import { error, json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { artefact } from '$lib/server/db/schema';
import { deleteScan, uploadScan } from '$lib/server/scans';
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

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to delete an image');

	const { url } = (await request.json().catch(() => ({}))) as { url?: string };
	if (!url || typeof url !== 'string') throw error(400, 'No URL provided');

	// Security Gate: Ensure the image is not attached to a saved artefact in the DB.
	// Only unattached transient uploads (draft scans) may be deleted via this endpoint.
	const existing = await db
		.select({ id: artefact.id })
		.from(artefact)
		.where(sql`exists (select 1 from json_each(${artefact.fileUrls}) where value = ${url})`)
		.get();

	if (existing) {
		throw error(403, 'Forbidden: Cannot delete an image that is attached to a saved artefact');
	}

	await deleteScan(url);
	return json({ success: true });
};
