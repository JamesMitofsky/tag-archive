import { fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { client, db } from '$lib/server/db';
import { artefactProvenance, eventHost, person } from '$lib/server/db/schema';
import { findDuplicatePairs } from '$lib/server/db/duplicates';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Admin tool, same gate as the roster it's reached from.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/settings');

	// Same roster shape as the contributors list: each person with their artefact
	// and event tallies, so the merge picker can show that context. count(distinct)
	// collapses the two left joins back to a true per-person count.
	const people = await db
		.select({
			id: person.id,
			name: person.name,
			artefactCount: sql<number>`count(distinct ${artefactProvenance.artefactId})`,
			eventCount: sql<number>`count(distinct ${eventHost.eventId})`
		})
		.from(person)
		.leftJoin(artefactProvenance, eq(artefactProvenance.personId, person.id))
		.leftJoin(eventHost, eq(eventHost.personId, person.id))
		.groupBy(person.id)
		.orderBy(person.name);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		people,
		// Near-match pairs (accent/case, word order, typos, initials) so the picker
		// can point straight at candidates — the roster has no exact-name dupes.
		duplicates: findDuplicatePairs(people)
	};
};

export const actions: Actions = {
	// Fold `removeId` into `keepId`: every artefact/event link moves to the kept
	// person, then the removed row is deleted so one id is used everywhere.
	default: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') throw redirect(303, '/keeper');

		const form = await request.formData();
		const keepId = Number(form.get('keepId'));
		const removeId = Number(form.get('removeId'));

		if (!Number.isInteger(keepId) || keepId <= 0 || !Number.isInteger(removeId) || removeId <= 0)
			return fail(400, { error: 'Pick a contributor to keep and one to remove.' });
		if (keepId === removeId) return fail(400, { error: 'Pick two different contributors.' });

		// Re-point the removed person's links onto the kept one, then delete the row.
		// OR IGNORE skips any link that would duplicate an existing (event/artefact,
		// person) pair — a person already on both sides — leaving those source rows
		// behind; the trailing deletes then clear them. Run as one atomic write batch
		// (single round-trip, no held interactive stream).
		await client.batch(
			[
				{
					sql: 'UPDATE OR IGNORE event_host SET person_id = ? WHERE person_id = ?',
					args: [keepId, removeId]
				},
				{ sql: 'DELETE FROM event_host WHERE person_id = ?', args: [removeId] },
				{
					sql: 'UPDATE OR IGNORE artefact_provenance SET person_id = ? WHERE person_id = ?',
					args: [keepId, removeId]
				},
				{ sql: 'DELETE FROM artefact_provenance WHERE person_id = ?', args: [removeId] },
				{ sql: 'DELETE FROM person WHERE id = ?', args: [removeId] }
			],
			'write'
		);

		// Back to the roster, where the folded entry is now gone.
		throw redirect(303, '/contributors');
	}
};
