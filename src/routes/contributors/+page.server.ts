import { fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { client, db } from '$lib/server/db';
import { stampUpdate } from '$lib/server/db/audit';
import { artefactProvenance, eventHost, person } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Signed-in only; and this roster is an admin tool — bounce everyone else.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/settings');

	// Every person, with how many artefacts they're the provenance of and how many
	// events they host. Two left joins would multiply rows against each other, so
	// count(distinct ...) collapses each side back to a true per-person tally.
	const rows = await db
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
		people: rows
	};
};

export const actions: Actions = {
	// Rename one canonical person. `name` is unique, so a clash with an existing
	// entry is rejected here — that case is a merge, not a rename.
	rename: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw redirect(303, '/keeper');

		const form = await request.formData();
		const id = Number(form.get('id'));
		const name = String(form.get('name') ?? '').trim();

		if (!Number.isInteger(id) || id <= 0)
			return fail(400, { action: 'rename' as const, id, error: 'Unknown contributor.' });
		if (!name) return fail(400, { action: 'rename' as const, id, error: 'Name is required.' });

		try {
			await db
				.update(person)
				.set({ name, ...stampUpdate(locals.user.id) })
				.where(eq(person.id, id));
		} catch {
			return fail(409, {
				action: 'rename' as const,
				id,
				error: 'A contributor with that name already exists — merge them instead.'
			});
		}

		return { action: 'rename' as const, id, error: undefined };
	},

	// Fold `removeId` into `keepId`: every artefact/event link moves to the kept
	// person, then the removed row is deleted so one id is used everywhere.
	merge: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw redirect(303, '/keeper');

		const form = await request.formData();
		const keepId = Number(form.get('keepId'));
		const removeId = Number(form.get('removeId'));

		if (!Number.isInteger(keepId) || keepId <= 0 || !Number.isInteger(removeId) || removeId <= 0)
			return fail(400, {
				action: 'merge' as const,
				error: 'Pick a contributor to keep and one to remove.'
			});
		if (keepId === removeId)
			return fail(400, { action: 'merge' as const, error: 'Pick two different contributors.' });

		// Re-point the removed person's links onto the kept one, then delete the row.
		// OR IGNORE skips any link that would duplicate an existing (event/artefact,
		// person) pair — a person already on both sides — leaving those source rows
		// behind; the trailing deletes then clear them. Run as one atomic write batch
		// (single round-trip, no held interactive stream).
		// Raw SQL bypasses Drizzle's $onUpdate / audit stamps, so the re-pointed rows
		// carry their audit columns explicitly. updated_at is timestamp_ms → epoch ms.
		const now = Date.now();
		const actor = locals.user.id;
		await client.batch(
			[
				{
					sql: 'UPDATE OR IGNORE event_host SET person_id = ?, updated_at = ?, updated_by = ? WHERE person_id = ?',
					args: [keepId, now, actor, removeId]
				},
				{ sql: 'DELETE FROM event_host WHERE person_id = ?', args: [removeId] },
				{
					sql: 'UPDATE OR IGNORE artefact_provenance SET person_id = ?, updated_at = ?, updated_by = ? WHERE person_id = ?',
					args: [keepId, now, actor, removeId]
				},
				{ sql: 'DELETE FROM artefact_provenance WHERE person_id = ?', args: [removeId] },
				{ sql: 'DELETE FROM person WHERE id = ?', args: [removeId] }
			],
			'write'
		);

		return { action: 'merge' as const, error: undefined };
	}
};
