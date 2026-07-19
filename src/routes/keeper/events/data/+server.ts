import { error, json } from '@sveltejs/kit';
import { searchEvents } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

// Paged, searchable feed behind the events list — the client fetches a window at
// a time and renders skeletons for rows it hasn't pulled yet.
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const q = url.searchParams.get('q') ?? '';
	const offset = Math.max(0, Math.trunc(Number(url.searchParams.get('offset')) || 0));
	// Clamp the page size so a crafted URL can't ask for the whole table at once.
	const limit = Math.min(
		200,
		Math.max(1, Math.trunc(Number(url.searchParams.get('limit')) || 100))
	);

	const { rows, total } = await searchEvents({ q, offset, limit });
	return json({ rows, total });
};
