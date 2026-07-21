import { error, fail, redirect } from '@sveltejs/kit';
import { eq, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachProvenance, resolvePersonIds } from '$lib/server/db/queries';
import { stampInsert, stampUpdate } from '$lib/server/db/audit';
import { artefact, artefactProvenance, event } from '$lib/server/db/schema';
import { idSchema } from '$lib/schemas';
import { createArtefactSuite, parseArtefactForm } from '$lib/validation/artefact';
import { summary } from '$lib/validation/helpers';
import type { Actions, PageServerLoad } from './$types';

/** Raw (unvalidated) edit-form values echoed back so a failed submit keeps input. */
export type ArtefactFormValues = {
	artefact: string;
	event: string;
	date: string;
	description: string;
	location: string;
	fileUrls: string[];
	/** Comma-separated in the form; kept raw so a failed submit doesn't lose it. */
	provenance: string;
	programArea: string[];
};

/** Empty string → null, for the artefact's nullable columns. */
const nullIfEmpty = (value: string) => (value === '' ? null : value);

/**
 * Resolve a typed event title to an existing event's id. Events are dated
 * happenings sourced from the events export — a bare title here can't create one,
 * so an unknown title yields null. A recurring title resolves to its earliest event.
 */
async function resolveEventId(name: string): Promise<number | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;

	const [existing] = await db
		.select({ id: event.id })
		.from(event)
		.where(eq(event.title, trimmed))
		.orderBy(event.date)
		.limit(1);
	return existing?.id ?? null;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	// Editing is admin-only; bounce anyone else back to the keeper page.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, `/keeper/${params.id}`);

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Artefact not found');

	// Flatten the event title and re-expand provenance so the form can pre-fill.
	const rows = await db
		.select({ ...getTableColumns(artefact), event: event.title })
		.from(artefact)
		.leftJoin(event, eq(artefact.eventId, event.id))
		.where(eq(artefact.id, id.data))
		.limit(1);
	if (rows.length === 0) throw error(404, 'Artefact not found');
	const [item] = await attachProvenance(rows);

	// The event combobox fetches its (distinct-title) options on demand from
	// `/keeper/events/titles`, so the loader only pulls the artefact itself.
	return {
		user: { email: locals.user.email, role: locals.user.role },
		artefact: item
	};
};

export const actions: Actions = {
	updateArtefact: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { artefactError: 'Sign in to edit an artefact' });
		if (locals.user.role !== 'admin') {
			return fail(403, { artefactError: 'Only admins can edit artefacts' });
		}
		const userId = locals.user.id;

		const id = idSchema.safeParse(params.id);
		if (!id.success) return fail(400, { artefactError: 'Unknown artefact' });

		const form = await request.formData();
		const data = parseArtefactForm(form);
		const result = createArtefactSuite()(data);
		if (!result.isValid()) {
			return fail(400, {
				artefactError: summary(result),
				errors: result.getErrors(),
				values: {
					artefact: String(form.get('artefact') ?? ''),
					event: String(form.get('event') ?? ''),
					date: String(form.get('date') ?? ''),
					description: String(form.get('description') ?? ''),
					location: String(form.get('location') ?? ''),
					fileUrls: data.fileUrls,
					provenance: String(form.get('provenance') ?? ''),
					programArea: data.programArea
				}
			});
		}

		const eventId = await resolveEventId(data.event);
		const personIds = await resolvePersonIds(data.provenance, userId);

		await db
			.update(artefact)
			.set({
				artefact: data.artefact,
				eventId,
				date: data.date,
				description: nullIfEmpty(data.description),
				location: nullIfEmpty(data.location),
				fileUrls: data.fileUrls,
				programArea: data.programArea,
				...stampUpdate(userId)
			})
			.where(eq(artefact.id, id.data));

		// Resync provenance links: drop the old set, insert the new one.
		await db.delete(artefactProvenance).where(eq(artefactProvenance.artefactId, id.data));
		if (personIds.length > 0) {
			await db.insert(artefactProvenance).values(
				personIds.map((personId) => ({
					artefactId: id.data,
					personId,
					...stampInsert(userId)
				}))
			);
		}

		// Back to the artefact page so the edits show.
		throw redirect(303, `/keeper/${id.data}`);
	},

	deleteArtefact: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { artefactError: 'Sign in to delete an artefact' });
		// Server-side role gate — the UI hides the button, but this is the enforcement.
		if (locals.user.role !== 'admin') {
			return fail(403, { artefactError: 'Only admins can delete artefacts' });
		}

		const id = idSchema.safeParse(params.id);
		if (!id.success) return fail(400, { artefactError: 'Unknown artefact' });

		await db.delete(artefact).where(eq(artefact.id, id.data));
		// Nothing left to show here — back to the artefacts list.
		throw redirect(303, '/keeper/artefacts');
	}
};
