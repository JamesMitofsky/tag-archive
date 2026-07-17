import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { resolveProvenanceIds } from '$lib/server/db/queries';
import { artefact, artefactProvenance, event, provenance } from '$lib/server/db/schema';
import { PROGRAM_AREAS } from '$lib/programAreas';
import type { Actions, PageServerLoad } from './$types';

/** Raw (unvalidated) create-form values echoed back so a failed submit keeps input. */
export type ArtefactFormValues = {
	artefact: string;
	event: string;
	date: string;
	description: string;
	location: string;
	fileName: string;
	fileUrl: string;
	/** Comma-separated in the form; kept raw so a failed submit doesn't lose it. */
	provenance: string;
	programArea: string[];
};

// Optional text field: empty string is allowed and later stored as NULL.
const optionalText = (max: number, label: string) =>
	z.string().trim().max(max, `Keep the ${label} under ${max} characters`);

const artefactSchema = z.object({
	artefact: z
		.string()
		.trim()
		.min(1, 'Title is required')
		.max(200, 'Keep the title under 200 characters'),
	event: optionalText(200, 'event'),
	date: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')]),
	description: optionalText(2000, 'description'),
	location: optionalText(200, 'location'),
	fileName: optionalText(200, 'file name'),
	fileUrl: z.union([z.literal(''), z.string().url('Enter a valid file URL')]),
	programArea: z.array(z.enum(PROGRAM_AREAS)),
	provenance: z.array(z.string().trim().min(1)).max(50)
});

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
 * Resolve an event name to its id, creating the event if it's new (find-or-create).
 * Empty name → null (artefact has no event). Keeps names canonical: the same name
 * always maps to one row, so recurring events group cleanly.
 */
async function resolveEventId(name: string): Promise<number | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;

	const [existing] = await db
		.select({ id: event.id })
		.from(event)
		.where(eq(event.name, trimmed))
		.limit(1);
	if (existing) return existing.id;

	const [created] = await db.insert(event).values({ name: trimmed }).returning({ id: event.id });
	return created.id;
}

export const load: PageServerLoad = async ({ locals }) => {
	// The create form is signed-in only; bounce guests back to the keeper page.
	if (!locals.user) throw redirect(303, '/cloud-keeper');

	// Existing events + people power the searchable datalists.
	const events = await db.select().from(event).orderBy(event.name);
	const provenancePeople = await db.select().from(provenance).orderBy(provenance.name);

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
			fileName: form.get('fileName') ?? '',
			fileUrl: form.get('fileUrl') ?? '',
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
					fileName: String(form.get('fileName') ?? ''),
					fileUrl: String(form.get('fileUrl') ?? ''),
					provenance: provenanceRaw,
					programArea: form.getAll('programArea').map(String)
				}
			});
		}

		// Find-or-create the event and provenance people, then link by id
		// (recurring events / repeat contributors reuse one row each).
		const eventId = await resolveEventId(parsed.data.event);
		const provenanceIds = await resolveProvenanceIds(parsed.data.provenance);

		// id is an INTEGER PRIMARY KEY (rowid alias) — omit it and SQLite assigns the next one.
		const [created] = await db
			.insert(artefact)
			.values({
				artefact: parsed.data.artefact,
				eventId,
				date: nullIfEmpty(parsed.data.date),
				description: nullIfEmpty(parsed.data.description),
				location: nullIfEmpty(parsed.data.location),
				fileName: nullIfEmpty(parsed.data.fileName),
				fileUrl: nullIfEmpty(parsed.data.fileUrl),
				programArea: parsed.data.programArea
			})
			.returning({ id: artefact.id });

		if (provenanceIds.length > 0) {
			await db
				.insert(artefactProvenance)
				.values(provenanceIds.map((provenanceId) => ({ artefactId: created.id, provenanceId })));
		}

		// Land back on the keeper page so the new artefact shows in the list.
		throw redirect(303, '/cloud-keeper');
	}
};
