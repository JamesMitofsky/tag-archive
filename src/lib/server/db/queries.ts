import {
	and,
	desc,
	eq,
	exists,
	getTableColumns,
	inArray,
	like,
	notInArray,
	or,
	sql
} from 'drizzle-orm';
import { client, db } from './index';
import { purgeArchiveCache } from '../cache';
import { stampInsert, stampUpdate } from './audit';
import { artefact, artefactProvenance, event, eventHost, person, series } from './schema';
import type { ArtefactWithEvent, EventWithMeta, Series } from './schema';

/**
 * Fold one or more people into a single kept entry: every artefact/event link on
 * a removed person moves to `keepId`, then the removed row is deleted so one id is
 * used everywhere. Powers both the manual two-way picker and the group review tool.
 *
 * `UPDATE OR IGNORE` skips any link that would duplicate an existing
 * (event/artefact, person) pair — a person already on both sides — leaving those
 * source rows behind; the trailing deletes then clear them. The whole set runs as
 * one atomic write batch (single round-trip, no held interactive stream).
 *
 * Raw SQL bypasses Drizzle's `$onUpdate` / audit stamps, so the re-pointed rows
 * carry their audit columns explicitly: `updated_at` is `timestamp_ms` → epoch ms,
 * `updated_by` is `userId` (the admin performing the merge).
 */
export async function mergePeople(
	keepId: number,
	removeIds: number[],
	userId: string
): Promise<void> {
	const targets = [...new Set(removeIds)].filter(
		(id) => Number.isInteger(id) && id > 0 && id !== keepId
	);
	if (targets.length === 0) return;

	const now = Date.now();
	const statements = targets.flatMap((removeId) => [
		{
			sql: 'UPDATE OR IGNORE event_host SET person_id = ?, updated_at = ?, updated_by = ? WHERE person_id = ?',
			args: [keepId, now, userId, removeId]
		},
		{ sql: 'DELETE FROM event_host WHERE person_id = ?', args: [removeId] },
		{
			sql: 'UPDATE OR IGNORE artefact_provenance SET person_id = ?, updated_at = ?, updated_by = ? WHERE person_id = ?',
			args: [keepId, now, userId, removeId]
		},
		{ sql: 'DELETE FROM artefact_provenance WHERE person_id = ?', args: [removeId] },
		{ sql: 'DELETE FROM person WHERE id = ?', args: [removeId] }
	]);

	await client.batch(statements, 'write');
	// Re-pointed provenance/host names change the public blob — refresh it.
	await purgeArchiveCache();
}

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
	// both read from it. Fire the slice and the total count together — they're
	// independent, so on a remote DB this is one round-trip instead of two.
	const [slice, [{ total }]] = await Promise.all([
		db
			.select({ ...getTableColumns(event), series: series.name })
			.from(event)
			.leftJoin(series, eq(event.seriesId, series.id))
			.where(filter)
			.orderBy(desc(event.date), desc(event.id))
			.limit(limit)
			.offset(offset),
		db
			.select({ total: sql<number>`count(*)` })
			.from(event)
			.leftJoin(series, eq(event.seriesId, series.id))
			.where(filter)
	]);

	// Hosts need the slice's ids, so this stays a follow-up round-trip.
	const rows = await attachHosts(slice);
	return { rows, total };
}

/** One distinct event title plus its earliest date, for the create/edit comboboxes. */
export type EventTitleOption = { name: string; date: string | null };

/**
 * Searchable, paged list of *distinct* event titles for the artefact comboboxes.
 * A recurring title (series) collapses to one row — its earliest date rides along
 * as low-emphasis context. Filtering is server-side so the client never loads the
 * whole table; the combobox fetches a window at a time and virtualizes the rest.
 * When `date` is passed, titles are prioritized by closeness to that date.
 */
export async function searchEventTitles({
	q,
	date,
	offset,
	limit
}: {
	q: string;
	date?: string;
	offset: number;
	limit: number;
}): Promise<{ rows: EventTitleOption[]; total: number }> {
	const term = q.trim().toLowerCase();
	const filter = term ? like(sql`lower(${event.title})`, `%${term}%`) : undefined;

	const cleanDate = date?.trim();
	const isValidDate = cleanDate && /^\d{4}-\d{2}-\d{2}$/.test(cleanDate);

	// Slice and the distinct-title count are independent — one round-trip on a
	// remote DB. The count matches the grouped set (distinct titles), not raw rows.
	const [rows, [{ total }]] = await Promise.all([
		db
			.select({ name: event.title, date: sql<string | null>`min(${event.date})` })
			.from(event)
			.where(filter)
			.groupBy(event.title)
			.orderBy(
				...(isValidDate
					? [sql`abs(julianday(min(${event.date})) - julianday(${cleanDate})) ASC`, event.title]
					: [event.title])
			)
			.limit(limit)
			.offset(offset),
		db
			.select({ total: sql<number>`count(distinct ${event.title})` })
			.from(event)
			.where(filter)
	]);

	return { rows, total };
}

/**
 * Find-or-create each person by name, returning their ids. Dedupes names first
 * so the same person always maps to one row (canonical, searchable across the
 * provenance and host roles alike).
 */
export async function resolvePersonIds(names: string[], userId: string): Promise<number[]> {
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
			.values(missing.map((name) => ({ name, ...stampInsert(userId) })))
			.returning({ id: person.id, name: person.name });
		for (const row of created) idByName.set(row.name, row.id);
	}

	return unique.map((name) => idByName.get(name)!);
}

/**
 * Search person names by case-insensitive prefix first (O(log N) index scan),
 * filling remaining slots up to `limit` with substring matches for full coverage.
 */
export async function searchPeople({
	q,
	limit = 20
}: {
	q: string;
	limit?: number;
}): Promise<{ id: number; name: string }[]> {
	const term = q.trim();
	if (!term) {
		return db
			.select({ id: person.id, name: person.name })
			.from(person)
			.orderBy(person.name)
			.limit(limit);
	}

	const termEscaped = term.replace(/[\\%_]/g, '\\$&');

	// 1. Index-accelerated prefix search (term%) first
	const prefixMatches = await db
		.select({ id: person.id, name: person.name })
		.from(person)
		.where(sql`${person.name} LIKE ${termEscaped + '%'} ESCAPE '\\'`)
		.orderBy(person.name)
		.limit(limit);

	if (prefixMatches.length >= limit) {
		return prefixMatches;
	}

	// 2. Substring matches (%term%) for remaining slots
	const prefixIds = new Set(prefixMatches.map((p) => p.id));
	const substringMatches = await db
		.select({ id: person.id, name: person.name })
		.from(person)
		.where(
			and(
				sql`${person.name} LIKE ${'%' + termEscaped + '%'} ESCAPE '\\'`,
				prefixMatches.length > 0 ? notInArray(person.id, Array.from(prefixIds)) : undefined
			)
		)
		.orderBy(person.name)
		.limit(limit - prefixMatches.length);

	return [...prefixMatches, ...substringMatches];
}

// ── Review queue ─────────────────────────────────────────────────────────────
// Contributor submissions land with `proposedAddition` true (see ./proposals)
// and wait here until an admin vets them. Approving flips the flag to false;
// rejecting deletes the row. Each list mirrors its keeper-list loader but scopes
// to the pending set, so the review pages read like a smaller version of the
// full archive.

/** How many rows of each kind are still awaiting a keeper's vetting. */
export async function countPendingReview(): Promise<{
	artefacts: number;
	events: number;
	series: number;
}> {
	const [[a], [e], [s]] = await Promise.all([
		db
			.select({ n: sql<number>`count(*)` })
			.from(artefact)
			.where(eq(artefact.proposedAddition, true)),
		db
			.select({ n: sql<number>`count(*)` })
			.from(event)
			.where(eq(event.proposedAddition, true)),
		db
			.select({ n: sql<number>`count(*)` })
			.from(series)
			.where(eq(series.proposedAddition, true))
	]);
	return { artefacts: a.n, events: e.n, series: s.n };
}

/** Proposed artefacts with their event title + provenance names, newest first. */
export async function listProposedArtefacts(): Promise<ArtefactWithEvent[]> {
	const rows = await db
		.select({ ...getTableColumns(artefact), event: event.title })
		.from(artefact)
		.leftJoin(event, eq(artefact.eventId, event.id))
		.where(eq(artefact.proposedAddition, true))
		.orderBy(desc(artefact.date), desc(artefact.id));
	return attachProvenance(rows);
}

/** Proposed events with their series name + host names, newest first. */
export async function listProposedEvents(): Promise<EventWithMeta[]> {
	const rows = await db
		.select({ ...getTableColumns(event), series: series.name })
		.from(event)
		.leftJoin(series, eq(event.seriesId, series.id))
		.where(eq(event.proposedAddition, true))
		.orderBy(desc(event.date), desc(event.id));
	return attachHosts(rows);
}

/** Proposed series, alphabetical. */
export async function listProposedSeries(): Promise<Series[]> {
	return db.select().from(series).where(eq(series.proposedAddition, true)).orderBy(series.name);
}

/** The three domain tables that carry a `proposed_addition` flag. */
export type ReviewKind = 'artefact' | 'event' | 'series';
const reviewTable = { artefact, event, series } as const;

/** Vet a proposed row: clear the flag so it joins the archive proper. No-op if
 *  the row is already vetted or gone. */
export async function approveProposed(kind: ReviewKind, id: number, userId: string): Promise<void> {
	const table = reviewTable[kind];
	await db
		.update(table)
		.set({ proposedAddition: false, ...stampUpdate(userId) })
		.where(and(eq(table.id, id), eq(table.proposedAddition, true)));
	// A vetted row becomes visible in the public blob — refresh it.
	await purgeArchiveCache();
}

/** Discard a proposed row entirely. Clears the FK references a delete would trip
 *  (artefacts point at events; events point at series) before removing the row. */
export async function rejectProposed(kind: ReviewKind, id: number, userId: string): Promise<void> {
	// Only ever delete a still-pending row — an approved row is real archive data.
	const guard = await db
		.select({ id: reviewTable[kind].id })
		.from(reviewTable[kind])
		.where(and(eq(reviewTable[kind].id, id), eq(reviewTable[kind].proposedAddition, true)))
		.limit(1);
	if (guard.length === 0) return;

	if (kind === 'event') {
		// Artefacts reference this event (nullable, no cascade) — unlink first.
		await db
			.update(artefact)
			.set({ eventId: null, ...stampUpdate(userId) })
			.where(eq(artefact.eventId, id));
		await db.delete(event).where(eq(event.id, id));
	} else if (kind === 'series') {
		// Events reference this series (nullable) — detach them into one-offs first.
		await db
			.update(event)
			.set({ seriesId: null, ...stampUpdate(userId) })
			.where(eq(event.seriesId, id));
		await db.delete(series).where(eq(series.id, id));
	} else {
		// Provenance links cascade on the artefact delete.
		await db.delete(artefact).where(eq(artefact.id, id));
	}
	// A discarded row leaves the public blob — refresh it.
	await purgeArchiveCache();
}

/**
 * Find-or-create a series by name, returning its id. A blank name yields null
 * (a one-off event has no series). `name` is unique, so a repeated banner always
 * resolves to the same row.
 */
export async function resolveSeriesId(name: string, userId: string): Promise<number | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;

	const [existing] = await db
		.select({ id: series.id })
		.from(series)
		.where(eq(series.name, trimmed))
		.limit(1);
	if (existing) return existing.id;

	const [created] = await db
		.insert(series)
		.values({ name: trimmed, ...stampInsert(userId) })
		.returning({ id: series.id });
	return created.id;
}
