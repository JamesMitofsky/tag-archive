import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The artefact form lives at /contribute, shared by keepers and the public: a
// signed-in admin's submission lands vetted, anyone else's waits for review.
// Kept as a redirect so old links and bookmarks still arrive.
export const load: PageServerLoad = () => {
	throw redirect(308, '/contribute');
};
