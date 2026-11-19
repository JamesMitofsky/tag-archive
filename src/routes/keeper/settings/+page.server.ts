import { redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.ts';
import { countPendingReview } from '#lib/server/db/queries.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Settings is behind sign-in; bounce anonymous visitors to the gate. A
	// listener (see #lib/roles) reaches it too, to see their account and sign out.
	const account = locals.user ?? locals.listener;
	if (!account) throw redirect(302, '/keeper');

	// Admins get the review queue's pending total for the Review link's badge.
	const isAdmin = locals.user?.role === 'admin';
	const pending = isAdmin ? await countPendingReview() : null;
	const pendingTotal = pending
		? pending.artefacts + pending.events + pending.series + pending.images
		: 0;

	return {
		user: { email: account.email, role: account.role ?? null },
		pendingTotal
	};
};

export const actions: Actions = {
	signOut: async ({ request }) => {
		await auth.api.signOut({ headers: request.headers });
		throw redirect(303, '/keeper');
	}
};
