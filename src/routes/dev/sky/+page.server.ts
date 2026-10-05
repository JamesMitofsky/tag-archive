import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Dev-only sky preview (see +page.svelte). 404s in production builds; the
// `?sky-at=` / `?sky-speed=` parameters it links to work everywhere.
export const load: PageServerLoad = () => {
	if (!dev) throw error(404, 'Not found');
};
