import { fail, redirect } from '@sveltejs/kit';
import { approveProposed, rejectProposed } from '$lib/server/db/queries';
import { listProposedImageSets } from '$lib/server/imageSets';
import { idSchema } from '$lib/schemas';
import type { Actions, PageServerLoad } from './$types';

/** Thumbnails per card; the rest are a click away on the set's own page. */
const THUMBNAILS = 8;

export const load: PageServerLoad = async ({ locals }) => {
	// Admin-only review tool; bounce everyone else back to settings.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');

	// Only what a card shows: the photographs' metadata and originals are read
	// on the set's own page, one set at a time.
	const sets = (await listProposedImageSets()).map((set) => ({
		id: set.id,
		description: set.description,
		event: set.event,
		date: set.date,
		count: set.images.length,
		thumbnails: set.images
			.slice(0, THUMBNAILS)
			.map((image) => ({ id: image.id, url: image.url, width: image.width, height: image.height })),
		// An anonymous submission has no creator.
		fromKeeper: set.createdBy !== null,
		contactName: set.contactName,
		contactEmail: set.contactEmail
	}));

	return {
		user: { email: locals.user.email, role: locals.user.role },
		sets
	};
};

export const actions: Actions = {
	approve: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { reviewError: 'Sign in to review submissions' });
		if (locals.user.role !== 'admin') {
			return fail(403, { reviewError: 'Only admins can review submissions' });
		}
		const id = idSchema.safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400, { reviewError: 'Unknown image set' });
		await approveProposed('imageSet', id.data, locals.user.id);
		return { approved: true };
	},

	reject: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { reviewError: 'Sign in to review submissions' });
		if (locals.user.role !== 'admin') {
			return fail(403, { reviewError: 'Only admins can review submissions' });
		}
		const id = idSchema.safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400, { reviewError: 'Unknown image set' });
		// Takes the set's photographs with it, rows and stored originals.
		await rejectProposed('imageSet', id.data, locals.user.id);
		return { rejected: true };
	}
};
