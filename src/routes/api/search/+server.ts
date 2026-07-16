import { json } from '@sveltejs/kit';
import { or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { artefact } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * Full-text-ish search across the archive.
 * Matches a substring (case-insensitive) in any of the requested fields.
 * provenance/programArea are JSON string arrays stored as text, so LIKE
 * on the raw JSON matches the contained values.
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (!q) return json({ results: [] });

	// Escape LIKE wildcards so user input is matched literally (see ESCAPE below).
	const term = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
	// SQLite LIKE is case-insensitive for ASCII. Backslash is the escape char
	// (written '\\' so the template literal emits a single literal backslash).
	const matches = (col: unknown) => sql`${col} LIKE ${term} ESCAPE '\\'`;

	const results = await db
		.select()
		.from(artefact)
		.where(
			or(
				matches(artefact.artefact),
				matches(artefact.event),
				matches(artefact.provenance),
				matches(artefact.programArea),
				matches(artefact.description)
			)
		);

	return json({ results });
};
