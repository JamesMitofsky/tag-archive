import { fail, redirect } from '@sveltejs/kit';
import { eq, min } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { resolvePersonIds } from '$lib/server/db/queries';
import { artefact, artefactProvenance, event, person } from '$lib/server/db/schema';
import { artefactSchema } from '$lib/schemas';
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

/** Split the comma-separated provenance field into a clean string array. */
function parseProvenance(raw: string): string[] {
	return raw
		.split(',')
		.map((name) => name.trim())
		.filter(Boolean);
}

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
	if (!locals.user) throw redirect(303, '/keepers');

	// Existing event titles + people power the searchable datalists. Distinct
	// titles only — a recurring title (series) shouldn't list once per date; its
	// earliest date rides along as low-emphasis context in the combobox.
	const events = await db
		.select({ name: event.title, date: min(event.date) })
		.from(event)
		.groupBy(event.title)
		.orderBy(event.title);
	const provenancePeople = await db.select().from(person).orderBy(person.name);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		events,
		provenancePeople
	};
};

export const actions: Actions = {
	createArtefact: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { artefactError: 'Sign in to add an artefact' });

		const form = await request.formData();
		const provenanceRaw = String(form.get('provenance') ?? '');
		const parsed = artefactSchema.safeParse({
			artefact: form.get('artefact'),
			event: form.get('event') ?? '',
			date: form.get('date') ?? '',
			description: form.get('description') ?? '',
			location: form.get('location') ?? '',
			fileUrls: form.getAll('fileUrls').map(String).filter(Boolean),
			programArea: form.getAll('programArea'),
			provenance: parseProvenance(provenanceRaw)
		});
		if (!parsed.success) {
			return fail(400, {
				artefactError: parsed.error.issues[0].message,
				values: {
					artefact: String(form.get('artefact') ?? ''),
					event: String(form.get('event') ?? ''),
					date: String(form.get('date') ?? ''),
					description: String(form.get('description') ?? ''),
					location: String(form.get('location') ?? ''),
					fileUrls: form.getAll('fileUrls').map(String).filter(Boolean),
					provenance: provenanceRaw,
					programArea: form.getAll('programArea').map(String)
				}
			});
		}

		// Resolve the event, then find-or-create the provenance people and link by
		// id (repeat contributors reuse one person row each).
		const eventId = await resolveEventId(parsed.data.event);
		const personIds = await resolvePersonIds(parsed.data.provenance);

		// id is an INTEGER PRIMARY KEY (rowid alias) — omit it and SQLite assigns the next one.
		const [created] = await db
			.insert(artefact)
			.values({
				artefact: parsed.data.artefact,
				eventId,
				date: nullIfEmpty(parsed.data.date),
				description: nullIfEmpty(parsed.data.description),
				location: nullIfEmpty(parsed.data.location),
				fileUrls: parsed.data.fileUrls,
				programArea: parsed.data.programArea
			})
			.returning({ id: artefact.id });

		if (personIds.length > 0) {
			await db
				.insert(artefactProvenance)
				.values(personIds.map((personId) => ({ artefactId: created.id, personId })));
		}

		// Land back on the artefacts list so the new artefact shows.
		throw redirect(303, '/keepers/artefacts');
	}
};
