import { error, fail, redirect } from '@sveltejs/kit';
import { desc, eq, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachHosts, attachProvenance } from '$lib/server/db/queries';
import { stampUpdate } from '$lib/server/db/audit';
import {
	artefact,
	artefactProvenance,
	event,
	eventHost,
	person,
	series
} from '$lib/server/db/schema';
import { idSchema } from '$lib/schemas';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Same gate as the roster it links from: signed-in admins only.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Contributor not found');

	const [item] = await db
		.select({ id: person.id, name: person.name })
		.from(person)
		.where(eq(person.id, id.data))
		.limit(1);
	if (!item) throw error(404, 'Contributor not found');

	// Everything this person is the provenance of and everything they host, each in
	// the same flattened shape its own list/detail page uses (event title / series
	// name flattened in; the join tables re-expanded to plain name arrays). Newest
	// first, matching the eager loaders. The two selects are independent — fire them
	// together so a remote DB does one round-trip.
	const [artefactRows, eventRows] = await Promise.all([
		db
			.select({ ...getTableColumns(artefact), event: event.title })
			.from(artefactProvenance)
			.innerJoin(artefact, eq(artefact.id, artefactProvenance.artefactId))
			.leftJoin(event, eq(event.id, artefact.eventId))
			.where(eq(artefactProvenance.personId, id.data))
			.orderBy(desc(artefact.date), desc(artefact.id)),
		db
			.select({ ...getTableColumns(event), series: series.name })
			.from(eventHost)
			.innerJoin(event, eq(event.id, eventHost.eventId))
			.leftJoin(series, eq(series.id, event.seriesId))
			.where(eq(eventHost.personId, id.data))
			.orderBy(desc(event.date), desc(event.id))
	]);

	// Re-expand provenance/hosts for the slices (one grouped query each, no N+1).
	const [artefacts, events] = await Promise.all([
		attachProvenance(artefactRows),
		attachHosts(eventRows)
	]);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		person: item,
		artefacts,
		events
	};
};

export const actions: Actions = {
	// Rename this canonical person. `name` is unique, so a clash with an existing
	// entry is rejected — that case is a merge (on the roster), not a rename.
	rename: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw redirect(303, '/keeper');

		const id = idSchema.safeParse(params.id);
		if (!id.success) return fail(400, { error: 'Unknown contributor.' });

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Name is required.' });

		try {
			await db
				.update(person)
				.set({ name, ...stampUpdate(locals.user.id) })
				.where(eq(person.id, id.data));
		} catch {
			return fail(409, {
				error: 'A contributor with that name already exists — merge them instead.'
			});
		}

		return { error: undefined };
	}
};
