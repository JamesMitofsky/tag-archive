import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { purgeArchiveCache } from './cache';
import { db } from './db';
import { stampInsert } from './db/audit';
import { isProposedAddition } from './db/proposals';
import { resolvePersonIds } from './db/queries';
import { artefact, artefactProvenance, event } from './db/schema';
import type { ArtefactData } from '$lib/validation/artefact';

/** Who is creating an artefact: a signed-in user, or an anonymous visitor (both null). */
export type Actor = { userId: string | null; role: string | null };

/**
 * Resolve a typed event title to an existing event's id. Events are dated
 * happenings sourced from the events export — a bare title here can't create one,
 * so an unknown title yields null (the artefact stays unlinked). A recurring
 * title resolves to its earliest event. An unvetted submitter can only link to
 * vetted events: the only ones they could have seen.
 */
async function resolveEventId(name: string, vettedOnly: boolean): Promise<number | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;

	const [existing] = await db
		.select({ id: event.id })
		.from(event)
		.where(
			and(eq(event.title, trimmed), vettedOnly ? eq(event.proposedAddition, false) : undefined)
		)
		.orderBy(event.date)
		.limit(1);
	return existing?.id ?? null;
}

/** Empty string → null, for the artefact's nullable columns. */
const nullIfEmpty = (value: string) => (value === '' ? null : value);

/**
 * Create an artefact from validated form data, with its provenance links.
 * Lands as a proposed addition unless an admin made it (see
 * `isProposedAddition`), and only purges the public cache when the new row is
 * actually public — so anonymous submissions can't trigger CDN purges at will.
 */
export async function createArtefact(data: ArtefactData, actor: Actor): Promise<number> {
	const proposed = isProposedAddition(actor.role);
	const eventId = await resolveEventId(data.event, proposed);
	const personIds = await resolvePersonIds(data.provenance, actor.userId);

	// id is AUTOINCREMENT — omit it and SQLite assigns the next one.
	const [created] = await db
		.insert(artefact)
		.values({
			artefact: data.artefact,
			eventId,
			date: data.date,
			description: nullIfEmpty(data.description),
			location: nullIfEmpty(data.location),
			fileUrls: data.fileUrls,
			programArea: data.programArea,
			proposedAddition: proposed,
			...stampInsert(actor.userId)
		})
		.returning({ id: artefact.id });

	if (personIds.length > 0) {
		await db.insert(artefactProvenance).values(
			personIds.map((personId) => ({
				artefactId: created.id,
				personId,
				...stampInsert(actor.userId)
			}))
		);
	}

	if (!proposed) await purgeArchiveCache();
	return created.id;
}

/**
 * Distinct previously-used storage locations, so anything typed in before
 * resurfaces as a picker option. Vetted rows only: a location typed into an
 * unreviewed submission isn't suggested to anyone until a keeper approves it.
 * Non-empty, sorted for a stable UI.
 */
export async function knownLocations(): Promise<string[]> {
	const rows = await db
		.selectDistinct({ location: artefact.location })
		.from(artefact)
		.where(and(isNotNull(artefact.location), eq(artefact.proposedAddition, false)))
		.orderBy(sql`lower(${artefact.location})`);
	return rows.map((r) => r.location?.trim()).filter((v): v is string => !!v);
}
