import { error, fail, redirect } from '@sveltejs/kit';
import { eq, getTableColumns } from 'drizzle-orm';
import { confirmNumber } from '$lib/server/artefacts';
import { db } from '$lib/server/db';
import { attachProvenance } from '$lib/server/db/queries';
import { artefact, event, numberConfirmation } from '$lib/server/db/schema';
import { idSchema } from '$lib/schemas';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Cloud Keeper is behind sign-in; bounce anonymous visitors to the gate.
	if (!locals.user) throw redirect(302, '/keeper');

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Artefact not found');

	// Same shape as the list load: flatten the event name, re-expand provenance.
	const rows = await db
		.select({
			...getTableColumns(artefact),
			event: event.title,
			numberConfirmedAt: numberConfirmation.createdAt
		})
		.from(artefact)
		.leftJoin(event, eq(artefact.eventId, event.id))
		.leftJoin(numberConfirmation, eq(numberConfirmation.artefactId, artefact.id))
		.where(eq(artefact.id, id.data))
		.limit(1);
	if (rows.length === 0) throw error(404, 'Artefact not found');

	const [item] = await attachProvenance(rows);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		artefact: item
	};
};

export const actions: Actions = {
	// Whoever holds the item confirms its number is written on it — any signed-in
	// keeper, not only admins, since contributors label what they bring in.
	confirmNumber: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { confirmError: 'Sign in to confirm the number.' });

		const id = idSchema.safeParse(params.id);
		if (!id.success) return fail(404, { confirmError: 'Artefact not found.' });

		if (!(await confirmNumber(id.data, locals.user.id))) {
			return fail(404, { confirmError: 'Artefact not found.' });
		}

		// Drop `?created`: the number is on the item, so the page stops asking.
		throw redirect(303, `/keeper/artefacts/${id.data}`);
	}
};
