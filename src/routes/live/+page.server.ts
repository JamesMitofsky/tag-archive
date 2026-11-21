import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The arrivals board was public here before it became an admin tool at
// /keeper/live. Kept as a redirect, carrying `?replay`, so a screen or bookmark
// still pointed here arrives; the keeper guard and that page's load then decide
// who gets in.
export const load: PageServerLoad = ({ url }) => {
	throw redirect(308, `/keeper/live${url.search}`);
};
