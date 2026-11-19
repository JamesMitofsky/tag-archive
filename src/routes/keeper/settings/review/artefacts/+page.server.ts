import { redirect } from '@sveltejs/kit';
import { listProposedArtefacts } from '#lib/server/db/queries.ts';
import { reviewActions } from '#lib/server/reviewActions.ts';
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

export const actions: Actions = reviewActions('artefact', 'artefact');
