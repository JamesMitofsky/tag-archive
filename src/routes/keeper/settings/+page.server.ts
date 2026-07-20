import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { countPendingReview } from '$lib/server/db/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Settings is behind sign-in; bounce anonymous visitors to the gate.
	if (!locals.user) throw redirect(302, '/keeper');

	// Admins get the review queue's pending total for the Review link's badge.
	const isAdmin = locals.user.role === 'admin';
	const pending = isAdmin ? await countPendingReview() : null;
	const pendingTotal = pending ? pending.artefacts + pending.events + pending.series : 0;

	return {
		user: { email: locals.user.email, role: locals.user.role },
		pendingTotal
	};
};

export const actions: Actions = {
	signOut: async ({ request }) => {
		await auth.api.signOut({ headers: request.headers });
		throw redirect(303, '/keeper');
	}
};
