import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Where a visitor without an access pass is sent (see $lib/access/gate). Once
// they hold one — a tap in another tab, say — there is nothing to see here.
export const load: PageServerLoad = ({ locals }) => {
	if (locals.pass) throw redirect(303, '/');
};
