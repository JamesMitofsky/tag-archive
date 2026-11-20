import { and, asc, desc, eq, getTableColumns, inArray, notInArray, sql } from 'drizzle-orm';
import { db } from './db';
import { attachProvenance } from './db/queries';
import { stampInsert } from './db/audit';
import { artefact, event, listenerArtefact, user } from './db/schema';
import type { ArtefactWithEvent } from './db/schema';

/**
 * What a listener's account may view (see #lib/roles): the artefacts an admin
 * chose for it, one `listener_artefact` row each. Read by the listener's page
 * (src/routes/listening) and read and written by the admin page that chooses
 * them (src/routes/keeper/settings/accounts/[id]).
 */

/**
 * The artefacts listener `userId` may view, as the public cloud draws them:
 * vetted ones only, like everything public (a chosen artefact still waiting in
 * the review queue stays hidden until vetted), with the event's title only
 * while that event is vetted too. Newest first, the undated last.
 */
export async function loadListenerArtefacts(userId: string): Promise<ArtefactWithEvent[]> {
	const vettedEvent = and(eq(artefact.eventId, event.id), eq(event.proposedAddition, false));
	const rows = await db
		.select({ ...getTableColumns(artefact), event: event.title })
		.from(listenerArtefact)
		.innerJoin(artefact, eq(artefact.id, listenerArtefact.artefactId))
		.leftJoin(event, vettedEvent)
		.where(and(eq(listenerArtefact.userId, userId), eq(artefact.proposedAddition, false)))
		// SQLite sorts NULL lowest, so a descending date lists the undated last.
		.orderBy(desc(artefact.date), desc(artefact.id));
	return attachProvenance(rows);
}

/** How many artefacts each account has been given, by account id. */
export async function countListenerArtefacts(): Promise<Map<string, number>> {
	const rows = await db
		.select({ userId: listenerArtefact.userId, n: sql<number>`count(*)` })
		.from(listenerArtefact)
		.innerJoin(artefact, eq(artefact.id, listenerArtefact.artefactId))
		.where(eq(artefact.proposedAddition, false))
		.groupBy(listenerArtefact.userId);
	return new Map(rows.map((r) => [r.userId, r.n]));
}

export type ListenerAccount = { id: string; name: string; email: string; role: string | null };

/** The account an admin is choosing for, or null if there is none. */
export function getAccount(id: string): Promise<ListenerAccount | undefined> {
	return db
		.select({ id: user.id, name: user.name, email: user.email, role: user.role })
		.from(user)
		.where(eq(user.id, id))
		.get();
}

export type ArtefactChoice = {
	id: number;
	artefact: string;
	date: string | null;
	event: string | null;
	chosen: boolean;
};

/**
 * Every vetted artefact an admin can give `userId`, marked with whether it is
 * already given, in the archive's own order (by id, the number written on the
 * object). Proposed additions are left out: they could be given, but would
 * stay hidden from the listener until vetted, which the page could only explain.
 */
export async function listArtefactChoices(userId: string): Promise<ArtefactChoice[]> {
	const vettedEvent = and(eq(artefact.eventId, event.id), eq(event.proposedAddition, false));
	return db
		.select({
			id: artefact.id,
			artefact: artefact.artefact,
			date: artefact.date,
			event: event.title,
			chosen: sql<boolean>`${listenerArtefact.artefactId} is not null`.mapWith(Boolean)
		})
		.from(artefact)
		.leftJoin(event, vettedEvent)
		.leftJoin(
			listenerArtefact,
			and(eq(listenerArtefact.artefactId, artefact.id), eq(listenerArtefact.userId, userId))
		)
		.where(eq(artefact.proposedAddition, false))
		.orderBy(asc(artefact.id));
}

/**
 * Give listener `userId` exactly the vetted artefacts `artefactIds`, as admin
 * `actorId`: rows for the rest of the vetted artefacts go, new ones are added,
 * and ones already there keep the stamp of whoever first gave them. Ids that
 * name no vetted artefact (a stale form, one deleted meanwhile) are ignored. A
 * row for an artefact still awaiting review, which the page never offers, is
 * left alone. One atomic batch, so a listener never sees half a change.
 *
 * Refuses an account that is not a listener (`not-listener`): only a listener
 * is held to what it was given, so choosing for anyone else would mean nothing.
 */
export async function setListenerArtefacts(
	actorId: string,
	userId: string,
	artefactIds: number[]
): Promise<'updated' | 'missing' | 'not-listener'> {
	const account = await getAccount(userId);
	if (!account) return 'missing';
	if (account.role !== 'listener') return 'not-listener';

	const wanted = [...new Set(artefactIds)];
	const vetted = wanted.length
		? (
				await db
					.select({ id: artefact.id })
					.from(artefact)
					.where(and(inArray(artefact.id, wanted), eq(artefact.proposedAddition, false)))
			).map((r) => r.id)
		: [];

	const vettedIds = db
		.select({ id: artefact.id })
		.from(artefact)
		.where(eq(artefact.proposedAddition, false));
	const dropUnwanted = db
		.delete(listenerArtefact)
		.where(
			and(
				eq(listenerArtefact.userId, userId),
				inArray(listenerArtefact.artefactId, vettedIds),
				vetted.length ? notInArray(listenerArtefact.artefactId, vetted) : undefined
			)
		);
	if (!vetted.length) {
		await dropUnwanted;
		return 'updated';
	}
	await db.batch([
		dropUnwanted,
		db
			.insert(listenerArtefact)
			.values(vetted.map((artefactId) => ({ userId, artefactId, ...stampInsert(actorId) })))
			.onConflictDoNothing()
	]);
	return 'updated';
}
