import { redirect } from '@sveltejs/kit';
import { desc, eq, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachProvenance } from '$lib/server/db/queries';
import { artefact, event } from '$lib/server/db/schema';
import { reviewActions } from '$lib/server/reviewActions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// This view is signed-in only; the keeper page owns the sign-in flow.
	if (!locals.user) throw redirect(303, '/keeper');

	// Join the event in and flatten its title to `event` (see ArtefactWithEvent).
	const rows = await db
		.select({ ...getTableColumns(artefact), event: event.title })
		.from(artefact)
		.leftJoin(event, eq(artefact.eventId, event.id))
		.orderBy(desc(artefact.date), desc(artefact.id));
	// Re-expand provenance names from the join table onto each artefact.
	const artefacts = await attachProvenance(rows);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		artefacts
	};
};

// Admins can vet a proposed addition straight from its card, without a trip to
// the review queue. The actions refuse anyone else.
export const actions: Actions = reviewActions('artefact', 'artefact');
