import { error, json } from '@sveltejs/kit';
import { searchEventTitles } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

// Paged, searchable feed of distinct event titles behind the artefact comboboxes.
// The client fetches a window at a time and virtualizes the dropdown, so the whole
// title list never ships or renders at once.
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const q = url.searchParams.get('q') ?? '';
	const offset = Math.max(0, Math.trunc(Number(url.searchParams.get('offset')) || 0));
	// Clamp the page size so a crafted URL can't ask for the whole table at once.
	const limit = Math.min(100, Math.max(1, Math.trunc(Number(url.searchParams.get('limit')) || 40)));

	const { rows, total } = await searchEventTitles({ q, offset, limit });
	return json({ rows, total });
};
