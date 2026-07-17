import { json } from '@sveltejs/kit';
import { eq, getTableColumns, inArray, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachProvenance } from '$lib/server/db/queries';
import { artefact, artefactProvenance, event, provenance } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * Full-text-ish search across the archive.
 * Matches a substring (case-insensitive) in any of the requested fields.
 * programArea is a JSON string array stored as text, so LIKE on the raw JSON
 * matches the contained values. event and provenance are normalised tables,
 * matched via their own columns.
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (!q) return json({ results: [] });

	// Escape LIKE wildcards so user input is matched literally (see ESCAPE below).
	const term = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
	// SQLite LIKE is case-insensitive for ASCII. Backslash is the escape char
	// (written '\\' so the template literal emits a single literal backslash).
	const matches = (col: unknown) => sql`${col} LIKE ${term} ESCAPE '\\'`;

	// Artefacts whose provenance (a joined table) matches the term.
	const provMatchIds = (
		await db
			.selectDistinct({ id: artefactProvenance.artefactId })
			.from(artefactProvenance)
			.innerJoin(provenance, eq(provenance.id, artefactProvenance.provenanceId))
			.where(matches(provenance.name))
	).map((r) => r.id);

	// Event lives in its own table now; join it in and expose the name flat as `event`.
	const rows = await db
		.select({ ...getTableColumns(artefact), event: event.name })
		.from(artefact)
		.leftJoin(event, eq(artefact.eventId, event.id))
		.where(
			or(
				matches(artefact.artefact),
				matches(event.name),
				matches(artefact.programArea),
				matches(artefact.description),
				provMatchIds.length ? inArray(artefact.id, provMatchIds) : sql`0`
			)
		);
	const results = await attachProvenance(rows);

	return json({ results });
};
