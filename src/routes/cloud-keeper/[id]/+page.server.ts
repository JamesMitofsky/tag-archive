import { error, redirect } from '@sveltejs/kit';
import { eq, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachProvenance } from '$lib/server/db/queries';
import { artefact, event } from '$lib/server/db/schema';
import { idSchema } from '$lib/schemas';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Cloud Keeper is behind sign-in; bounce anonymous visitors to the gate.
	if (!locals.user) throw redirect(302, '/cloud-keeper');

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Artefact not found');

	// Same shape as the list load: flatten the event name, re-expand provenance.
	const rows = await db
		.select({ ...getTableColumns(artefact), event: event.title })
		.from(artefact)
		.leftJoin(event, eq(artefact.eventId, event.id))
		.where(eq(artefact.id, id.data))
		.limit(1);
	if (rows.length === 0) throw error(404, 'Artefact not found');

	const [item] = await attachProvenance(rows);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		artefact: item
	};
};
