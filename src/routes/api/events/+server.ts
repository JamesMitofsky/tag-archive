import { json } from '@sveltejs/kit';
import { searchEvents } from '$lib/server/events';
import type { RequestHandler } from './$types';

/**
 * Substring search over the static U Street events export. Mirrors /api/search
 * so the /events page can reuse the same fetch-on-keystroke flow — but the data
 * lives in a JSON file, not the DB.
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	return json({ results: searchEvents(q) });
};
