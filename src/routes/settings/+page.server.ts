import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Settings is behind sign-in; bounce anonymous visitors to the gate.
	if (!locals.user) throw redirect(302, '/keeper');

	return {
		user: { email: locals.user.email, role: locals.user.role }
	};
};

export const actions: Actions = {
	signOut: async ({ request }) => {
		await auth.api.signOut({ headers: request.headers });
		throw redirect(303, '/keeper');
	}
};
