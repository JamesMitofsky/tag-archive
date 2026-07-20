import { fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mergePeople } from '$lib/server/db/queries';
import { artefactProvenance, eventHost, person } from '$lib/server/db/schema';
import { findDuplicateGroups } from '$lib/server/db/duplicates';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Admin tool, same gate as the roster it's reached from.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');

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
		// Near-match groups (accent/case, word order, typos, initials) so the picker
		// can point straight at candidates — the roster has no exact-name dupes.
		duplicates: findDuplicateGroups(people)
	};
};

export const actions: Actions = {
	// Fold `removeId` into `keepId`: every artefact/event link moves to the kept
	// person, then the removed row is deleted so one id is used everywhere.
	default: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw redirect(303, '/keeper');

		const form = await request.formData();
		const keepId = Number(form.get('keepId'));
		const removeId = Number(form.get('removeId'));

		if (!Number.isInteger(keepId) || keepId <= 0 || !Number.isInteger(removeId) || removeId <= 0)
			return fail(400, { error: 'Pick a contributor to keep and one to remove.' });
		if (keepId === removeId) return fail(400, { error: 'Pick two different contributors.' });

		await mergePeople(keepId, [removeId], locals.user.id);

		// Back to the roster, where the folded entry is now gone.
		throw redirect(303, '/keeper/contributors');
	}
};
