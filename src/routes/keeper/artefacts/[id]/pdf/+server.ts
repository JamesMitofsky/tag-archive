import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { artefact } from '$lib/server/db/schema';
import { idSchema } from '$lib/schemas';
import { isImageUrl } from '$lib/fileType';
import { fetchNormalizedImage } from '$lib/server/imageBytes';
import { buildImagePdf } from '$lib/server/pdf';
import type { RequestHandler } from './$types';

// Every scan attached to one artefact, compiled into a single PDF — one image per page,
// in the order they appear on the detail page. Read-only, so no cache purge; the
// response is per-user and short-lived, so it is never cached either.

/** Filename-safe stem from the artefact title. */
function slugify(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/, '');
	return slug || 'artefact';
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	// Same gate as the detail page load: Cloud Keeper is behind sign-in.
	if (!locals.user) throw redirect(302, '/keeper');

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Artefact not found');

	const rows = await db
		.select({ title: artefact.artefact, fileUrls: artefact.fileUrls })
		.from(artefact)
		.where(eq(artefact.id, id.data))
		.limit(1);
	if (rows.length === 0) throw error(404, 'Artefact not found');

	const [item] = rows;

	// Non-image attachments (a linked PDF, say) have nothing to draw onto a page.
	const imageUrls = item.fileUrls.filter(isImageUrl);
	if (imageUrls.length === 0) throw error(404, 'This artefact has no images to compile');

	// Indexed map, not push-on-settle: page order must follow fileUrls, not the network.
	const fetched = await Promise.all(imageUrls.map((src) => fetchNormalizedImage(src, url.origin)));
	const images = fetched.filter((image) => image !== null);
	if (images.length === 0) throw error(502, 'None of this artefact’s images could be read');

	const bytes = await buildImagePdf(images);

	return new Response(bytes, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${slugify(item.title)}-${id.data}.pdf"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
