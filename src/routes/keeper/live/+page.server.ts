import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The arrivals board is an admin tool. hooks.server.ts already keeps anonymous
// visitors and listeners out of /keeper/*; this turns away contributors too.
// The page has no actions, so guarding the load guards all of it.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');
	return {};
};
