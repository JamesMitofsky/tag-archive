import { fail, redirect } from '@sveltejs/kit';
import { eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { purgeArchiveCache } from '$lib/server/cache';
import { resolvePersonIds } from '$lib/server/db/queries';
import { stampInsert } from '$lib/server/db/audit';
import { isProposedAddition } from '$lib/server/db/proposals';
import { artefact, artefactProvenance, event } from '$lib/server/db/schema';
import { createArtefactSuite, parseArtefactForm } from '$lib/validation/artefact';
import { summary } from '$lib/validation/helpers';
import type { Actions, PageServerLoad } from './$types';

/** Raw (unvalidated) create-form values echoed back so a failed submit keeps input. */
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
 * so an unknown title yields null (the artefact stays unlinked). A recurring
 * title resolves to its earliest event.
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

export const load: PageServerLoad = async ({ locals }) => {
	// The create form is signed-in only; bounce guests back to the keeper page.
	if (!locals.user) throw redirect(303, '/keeper');

	// Distinct previously-used locations, so anything a keeper typed in before
	// resurfaces as a picker option next time. Non-empty, sorted for stable UI.
	const rows = await db
		.selectDistinct({ location: artefact.location })
		.from(artefact)
		.where(isNotNull(artefact.location))
		.orderBy(sql`lower(${artefact.location})`);
	const locations = rows.map((r) => r.location?.trim()).filter((v): v is string => !!v);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		locations
	};
};

export const actions: Actions = {
	createArtefact: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { artefactError: 'Sign in to add an artefact' });
		const userId = locals.user.id;

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

		// Resolve the event, then find-or-create the provenance people and link by
		// id (repeat contributors reuse one person row each).
		const eventId = await resolveEventId(data.event);
		const personIds = await resolvePersonIds(data.provenance, userId);

		// id is an INTEGER PRIMARY KEY (rowid alias) — omit it and SQLite assigns the next one.
		const [created] = await db
			.insert(artefact)
			.values({
				artefact: data.artefact,
				eventId,
				date: data.date,
				description: nullIfEmpty(data.description),
				location: nullIfEmpty(data.location),
				fileUrls: data.fileUrls,
				programArea: data.programArea,
				proposedAddition: isProposedAddition(locals.user.role),
				...stampInsert(userId)
			})
			.returning({ id: artefact.id });

		if (personIds.length > 0) {
			await db.insert(artefactProvenance).values(
				personIds.map((personId) => ({
					artefactId: created.id,
					personId,
					...stampInsert(userId)
				}))
			);
		}

		await purgeArchiveCache();

		// Land back on the artefacts list so the new artefact shows.
		throw redirect(303, '/keeper/artefacts');
	}
};
