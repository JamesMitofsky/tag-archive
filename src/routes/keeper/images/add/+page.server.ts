import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The photograph form lives at /contribute/images, shared by keepers and the
// public: a signed-in admin's set lands vetted, anyone else's waits for review.
// Kept as a redirect so a guessed or bookmarked add URL still arrives.
export const load: PageServerLoad = () => {
	throw redirect(308, '/contribute/images');
};
