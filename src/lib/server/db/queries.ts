import { eq, inArray } from 'drizzle-orm';
import { db } from './index';
import { artefactProvenance, provenance } from './schema';

/**
 * Re-expand the normalised provenance links back to a plain name array per
 * artefact. Runs one extra query for a whole result set (no N+1), then groups
 * in memory — keeps the artefact list/search selects simple and join-free.
 */
export async function attachProvenance<T extends { id: number }>(
	rows: T[]
): Promise<(T & { provenance: string[] })[]> {
	if (rows.length === 0) return [];

	const links = await db
		.select({ artefactId: artefactProvenance.artefactId, name: provenance.name })
		.from(artefactProvenance)
		.innerJoin(provenance, eq(provenance.id, artefactProvenance.provenanceId))
		.where(
			inArray(
				artefactProvenance.artefactId,
				rows.map((r) => r.id)
			)
		)
		.orderBy(provenance.name);

	const byArtefact = new Map<number, string[]>();
	for (const link of links) {
		const list = byArtefact.get(link.artefactId) ?? [];
		list.push(link.name);
		byArtefact.set(link.artefactId, list);
	}

	return rows.map((row) => ({ ...row, provenance: byArtefact.get(row.id) ?? [] }));
}

/**
 * Find-or-create each provenance person by name, returning their ids. Dedupes
 * names first so the same person always maps to one row (canonical, searchable).
 */
export async function resolveProvenanceIds(names: string[]): Promise<number[]> {
	const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
	if (unique.length === 0) return [];

	const existing = await db
		.select({ id: provenance.id, name: provenance.name })
		.from(provenance)
		.where(inArray(provenance.name, unique));
	const idByName = new Map(existing.map((row) => [row.name, row.id]));

	const missing = unique.filter((name) => !idByName.has(name));
	if (missing.length > 0) {
		const created = await db
			.insert(provenance)
			.values(missing.map((name) => ({ name })))
			.returning({ id: provenance.id, name: provenance.name });
		for (const row of created) idByName.set(row.name, row.id);
	}

	return unique.map((name) => idByName.get(name)!);
}
