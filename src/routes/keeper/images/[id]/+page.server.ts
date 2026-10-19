import { error, redirect } from '@sveltejs/kit';
import { loadImageSet } from '$lib/server/imageSets';
import { idSchema } from '$lib/schemas';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Cloud Keeper is behind sign-in; bounce anonymous visitors to the gate.
	if (!locals.user) throw redirect(302, '/keeper');

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Image set not found');

	const set = await loadImageSet(id.data);
	if (!set) throw error(404, 'Image set not found');

	// Field by field, so nothing rides along unnoticed. Keepers only, and one set
	// at a time, so each photograph's original and metadata (GPS and device
	// details included) may come with it: this page is where a keeper reads them.
	return {
		user: { email: locals.user.email, role: locals.user.role },
		set: {
			id: set.id,
			description: set.description,
			event: set.event,
			date: set.date,
			dateAuto: set.dateAuto,
			proposedAddition: set.proposedAddition,
			images: set.images.map((image) => ({
				id: image.id,
				url: image.url,
				width: image.width,
				height: image.height,
				originalUrl: image.originalUrl,
				originalType: image.originalType,
				originalName: image.originalName,
				originalBytes: image.originalBytes,
				capturedAt: image.capturedAt,
				capturedOffset: image.capturedOffset,
				metadata: image.metadata
			}))
		}
	};
};
