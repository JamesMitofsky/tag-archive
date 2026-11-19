import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { approveProposed, listProposedEvents, rejectProposed } from '$lib/server/db/queries';
import { event } from '$lib/server/db/schema';
import { featureImagesWhere } from '$lib/server/eventFeatures';
import { idSchema } from '$lib/schemas';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Admin-only review tool; bounce everyone else back to settings.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');

	// Each event's feature image, so the reviewer sees what approving it would
	// show. Pending sources included (vettedOnly false): the card says when the
	// image itself still needs approving before it goes public.
	const [events, features] = await Promise.all([
		listProposedEvents(),
		featureImagesWhere(eq(event.proposedAddition, true), { vettedOnly: false })
	]);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		events: events.map((item) => ({ ...item, featureImage: features.get(item.id) ?? null }))
	};
};

export const actions: Actions = {
	approve: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { reviewError: 'Sign in to review submissions' });
		if (locals.user.role !== 'admin') {
			return fail(403, { reviewError: 'Only admins can review submissions' });
		}
		const id = idSchema.safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400, { reviewError: 'Unknown event' });
		await approveProposed('event', id.data, locals.user.id);
		return { approved: true };
	},

	reject: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { reviewError: 'Sign in to review submissions' });
		if (locals.user.role !== 'admin') {
			return fail(403, { reviewError: 'Only admins can review submissions' });
		}
		const id = idSchema.safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400, { reviewError: 'Unknown event' });
		await rejectProposed('event', id.data, locals.user.id);
		return { rejected: true };
	}
};
