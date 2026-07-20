import { redirect } from '@sveltejs/kit';
import { countPendingReview } from '$lib/server/db/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// The review queue is an admin tool — bounce everyone else back to settings.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');

	const pending = await countPendingReview();

	return {
		user: { email: locals.user.email, role: locals.user.role },
		pending
	};
};
