import { and, desc, eq, exists, getTableColumns, inArray, like, or, sql } from 'drizzle-orm';
import { db } from './index';
import { artefactProvenance, event, eventHost, person, series } from './schema';
import type { EventWithMeta } from './schema';

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
		.select({ artefactId: artefactProvenance.artefactId, name: person.name })
		.from(artefactProvenance)
		.innerJoin(person, eq(person.id, artefactProvenance.personId))
		.where(
			inArray(
				artefactProvenance.artefactId,
				rows.map((r) => r.id)
			)
		)
		.orderBy(person.name);

	const byArtefact = new Map<number, string[]>();
	for (const link of links) {
		const list = byArtefact.get(link.artefactId) ?? [];
		list.push(link.name);
		byArtefact.set(link.artefactId, list);
	}

	return rows.map((row) => ({ ...row, provenance: byArtefact.get(row.id) ?? [] }));
}

/**
 * Re-expand the normalised host links back to a plain name array per event. Same
 * shape as `attachProvenance`: one grouped query for the whole set, no N+1.
 */
export async function attachHosts<T extends { id: number }>(
	rows: T[]
): Promise<(T & { hosts: string[] })[]> {
	if (rows.length === 0) return [];

	const links = await db
		.select({ eventId: eventHost.eventId, name: person.name })
		.from(eventHost)
		.innerJoin(person, eq(person.id, eventHost.personId))
		.where(
			inArray(
				eventHost.eventId,
				rows.map((r) => r.id)
			)
		)
		.orderBy(person.name);

	const byEvent = new Map<number, string[]>();
	for (const link of links) {
		const list = byEvent.get(link.eventId) ?? [];
		list.push(link.name);
		byEvent.set(link.eventId, list);
	}

	return rows.map((row) => ({ ...row, hosts: byEvent.get(row.id) ?? [] }));
}

/**
 * One page of events matching an optional text query, plus the total match count
 * so the list can size its scrollbar and page the rest in lazily. Search mirrors
 * the old client-side filter: title, series name, description, location, date,
 * and host names (the last via an EXISTS over the host join). Ordered newest
 * first, matching the eager loader.
 */
export async function searchEvents({
	q,
	offset,
	limit
}: {
	q: string;
	offset: number;
	limit: number;
}): Promise<{ rows: EventWithMeta[]; total: number }> {
	const term = q.trim().toLowerCase();
	const filter = term
		? or(
				like(sql`lower(${event.title})`, `%${term}%`),
				like(sql`lower(${series.name})`, `%${term}%`),
				like(sql`lower(${event.description})`, `%${term}%`),
				like(sql`lower(${event.location})`, `%${term}%`),
				like(sql`lower(${event.date})`, `%${term}%`),
				exists(
					db
						.select({ one: sql`1` })
						.from(eventHost)
						.innerJoin(person, eq(person.id, eventHost.personId))
						.where(
							and(eq(eventHost.eventId, event.id), like(sql`lower(${person.name})`, `%${term}%`))
						)
				)
			)
		: undefined;

	// Both queries need the series join: the filter and the flattened `series` name
	// both read from it.
	const slice = await db
		.select({ ...getTableColumns(event), series: series.name })
		.from(event)
		.leftJoin(series, eq(event.seriesId, series.id))
		.where(filter)
		.orderBy(desc(event.date), desc(event.id))
		.limit(limit)
		.offset(offset);

	const [{ total }] = await db
		.select({ total: sql<number>`count(*)` })
		.from(event)
		.leftJoin(series, eq(event.seriesId, series.id))
		.where(filter);

	const rows = await attachHosts(slice);
	return { rows, total };
}

/**
 * Find-or-create each person by name, returning their ids. Dedupes names first
 * so the same person always maps to one row (canonical, searchable across the
 * provenance and host roles alike).
 */
export async function resolvePersonIds(names: string[]): Promise<number[]> {
	const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
	if (unique.length === 0) return [];

	const existing = await db
		.select({ id: person.id, name: person.name })
		.from(person)
		.where(inArray(person.name, unique));
	const idByName = new Map(existing.map((row) => [row.name, row.id]));

	const missing = unique.filter((name) => !idByName.has(name));
	if (missing.length > 0) {
		const created = await db
			.insert(person)
			.values(missing.map((name) => ({ name })))
			.returning({ id: person.id, name: person.name });
		for (const row of created) idByName.set(row.name, row.id);
	}

	return unique.map((name) => idByName.get(name)!);
}

/**
 * Find-or-create a series by name, returning its id. A blank name yields null
 * (a one-off event has no series). `name` is unique, so a repeated banner always
 * resolves to the same row.
 */
export async function resolveSeriesId(name: string): Promise<number | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;

	const [existing] = await db
		.select({ id: series.id })
		.from(series)
		.where(eq(series.name, trimmed))
		.limit(1);
	if (existing) return existing.id;

	const [created] = await db.insert(series).values({ name: trimmed }).returning({ id: series.id });
	return created.id;
}
