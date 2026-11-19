import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The keepers' photograph form lives at /keeper/images/new. Kept as a redirect
// so a guessed or bookmarked add URL still arrives.
export const load: PageServerLoad = () => {
	throw redirect(308, '/keeper/images/new');
};
