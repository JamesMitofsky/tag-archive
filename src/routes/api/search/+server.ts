import { json } from '@sveltejs/kit';
import { and, eq, getTableColumns, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachProvenance } from '$lib/server/db/queries';
import { artefact, artefactProvenance, event, person } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * Tokenized search across the archive.
 * Breaks query string into tokens, matching prefix or substring across artefact title,
 * description, program area, event title, and provenance contributor names.
 */
export const GET: RequestHandler = async ({ url }) => {
	const rawQ = url.searchParams.get('q')?.trim() ?? '';
	if (!rawQ) return json({ results: [] });

	const tokens = rawQ.split(/\s+/).filter((t) => t.length > 0);
	if (tokens.length === 0) return json({ results: [] });

	// For each token, build a match condition across fields
	const tokenConditions = tokens.map((token) => {
		const escaped = token.replace(/[\\%_]/g, '\\$&');
		const pattern = `%${escaped}%`;
		return or(
			sql`${artefact.artefact} LIKE ${pattern} ESCAPE '\\'`,
			sql`${event.title} LIKE ${pattern} ESCAPE '\\'`,
			sql`${artefact.programArea} LIKE ${pattern} ESCAPE '\\'`,
			sql`${artefact.description} LIKE ${pattern} ESCAPE '\\'`,
			sql`${person.name} LIKE ${pattern} ESCAPE '\\'`
		);
	});

	// Find matching artefacts in a single pass
	const rows = await db
		.selectDistinct({ ...getTableColumns(artefact), event: event.title })
		.from(artefact)
		.leftJoin(event, eq(artefact.eventId, event.id))
		.leftJoin(artefactProvenance, eq(artefact.id, artefactProvenance.artefactId))
		.leftJoin(person, eq(person.id, artefactProvenance.personId))
		.where(and(...tokenConditions))
		.limit(100);

	const results = await attachProvenance(rows);

	return json({ results });
};
