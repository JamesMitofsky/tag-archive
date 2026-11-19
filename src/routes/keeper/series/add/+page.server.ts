import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The keepers' series form lives at /keeper/series/new. Kept as a redirect so
// old links and bookmarks still arrive.
export const load: PageServerLoad = () => {
	throw redirect(308, '/keeper/series/new');
};
