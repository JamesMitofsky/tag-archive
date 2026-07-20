import { fail, redirect } from '@sveltejs/kit';
import { approveProposed, listProposedArtefacts, rejectProposed } from '$lib/server/db/queries';
import { idSchema } from '$lib/schemas';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Admin-only review tool; bounce everyone else back to settings.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');

	return {
		user: { email: locals.user.email, role: locals.user.role },
		artefacts: await listProposedArtefacts()
	};
};

export const actions: Actions = {
	approve: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { reviewError: 'Sign in to review submissions' });
		if (locals.user.role !== 'admin') {
			return fail(403, { reviewError: 'Only admins can review submissions' });
		}
		const id = idSchema.safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400, { reviewError: 'Unknown artefact' });
		await approveProposed('artefact', id.data, locals.user.id);
		return { approved: true };
	},

	reject: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { reviewError: 'Sign in to review submissions' });
		if (locals.user.role !== 'admin') {
			return fail(403, { reviewError: 'Only admins can review submissions' });
		}
		const id = idSchema.safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400, { reviewError: 'Unknown artefact' });
		await rejectProposed('artefact', id.data, locals.user.id);
		return { rejected: true };
	}
};
