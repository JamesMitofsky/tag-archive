import { redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { artefactProvenance, eventHost, person } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

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
