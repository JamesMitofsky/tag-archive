import { json } from '@sveltejs/kit';
import { searchPeople } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

/**
 * Substring search (case-insensitive) across person names in the DB.
 * Returns matching person records for autocomplete/provenance comboboxes.
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20;

	const rows = await searchPeople({ q, limit });

	return json({ results: rows, rows });
};
