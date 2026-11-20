import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The keepers' event form lives at /keeper/events/new. Kept as a redirect so
// old links and bookmarks still arrive.
export const load: PageServerLoad = () => {
	throw redirect(308, '/keeper/events/new');
};
