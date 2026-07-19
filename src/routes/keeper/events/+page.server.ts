import { redirect } from '@sveltejs/kit';
import { searchEvents } from '$lib/server/db/queries';
import type { PageServerLoad } from './$types';

// Rows fetched per page, both here (first page) and by the lazy client fetches.
const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ locals, url }) => {
	// This view is signed-in only; the keeper page owns the sign-in flow.
	if (!locals.user) throw redirect(303, '/keeper');

	// Optional search seed, e.g. arriving from a series card (?q=Series Name).
	const q = url.searchParams.get('q') ?? '';
	// Only the first page ships with the document; the rest streams in on scroll.
	const { rows, total } = await searchEvents({ q, offset: 0, limit: PAGE_SIZE });

	return {
		user: { email: locals.user.email, role: locals.user.role },
		events: rows,
		total,
		pageSize: PAGE_SIZE,
		q
	};
};
