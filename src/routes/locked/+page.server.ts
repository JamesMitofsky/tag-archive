import { redirect } from '@sveltejs/kit';
import { LISTENER_PATH } from '#lib/access/paths.ts';
import type { PageServerLoad } from './$types';

// Where a visitor without an access pass is sent (see #lib/access/gate). Once
// they hold one — a tap in another tab, say — there is nothing to see here. A
// signed-in listener is never told to tap the Cube: their account opens their
// own page (see #lib/roles), which is where the gate sends them too, except
// when the middleware, which cannot see the session, got there first.
//
// The session decides that, never a listener's pass alone: someone who signed
// out still holds one until it lapses, and /listening sends them back here.
export const load: PageServerLoad = ({ locals }) => {
	if (locals.pass) throw redirect(303, '/');
	if (locals.listener) throw redirect(303, LISTENER_PATH);
};
