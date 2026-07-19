import { error, fail, redirect } from '@sveltejs/kit';
import { eq, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachHosts, resolvePersonIds, resolveSeriesId } from '$lib/server/db/queries';
import { stampInsert, stampUpdate } from '$lib/server/db/audit';
import { artefact, event, eventHost, person, series } from '$lib/server/db/schema';
import { eventSchema, idSchema } from '$lib/schemas';
import type { Actions, PageServerLoad } from './$types';

/** Raw (unvalidated) edit-form values echoed back so a failed submit keeps input. */
export type EventFormValues = {
	title: string;
	series: string;
	date: string;
	time: string;
	location: string;
	description: string;
	url: string;
	/** Comma-separated in the form; kept raw so a failed submit doesn't lose it. */
	hosts: string;
};

/** Split the comma-separated hosts field into a clean string array. */
function parseHosts(raw: string): string[] {
	return raw
		.split(',')
		.map((name) => name.trim())
		.filter(Boolean);
}

/** Empty string → null, for the event's nullable columns. */
const nullIfEmpty = (value: string) => (value === '' ? null : value);

export const load: PageServerLoad = async ({ params, locals }) => {
	// Editing is admin-only; bounce anyone else back to the event page.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, `/keeper/events/${params.id}`);

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Event not found');

	// Flatten the series name and re-expand hosts so the form can pre-fill.
	const rows = await db
		.select({ ...getTableColumns(event), series: series.name })
		.from(event)
		.leftJoin(series, eq(event.seriesId, series.id))
		.where(eq(event.id, id.data))
		.limit(1);
	if (rows.length === 0) throw error(404, 'Event not found');
	const [item] = await attachHosts(rows);

	// Existing series names + people power the searchable datalists.
	const seriesList = await db.select({ name: series.name }).from(series).orderBy(series.name);
	const hostPeople = await db.select().from(person).orderBy(person.name);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		event: item,
		series: seriesList,
		hostPeople
	};
};

export const actions: Actions = {
	updateEvent: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { eventError: 'Sign in to edit an event' });
		if (locals.user.role !== 'admin') {
			return fail(403, { eventError: 'Only admins can edit events' });
		}
		const userId = locals.user.id;

		const id = idSchema.safeParse(params.id);
		if (!id.success) return fail(400, { eventError: 'Unknown event' });

		const form = await request.formData();
		const hostsRaw = String(form.get('hosts') ?? '');
		const parsed = eventSchema.safeParse({
			title: form.get('title'),
			series: form.get('series') ?? '',
			date: form.get('date') ?? '',
			time: form.get('time') ?? '',
			location: form.get('location') ?? '',
			description: form.get('description') ?? '',
			url: form.get('url') ?? '',
			hosts: parseHosts(hostsRaw)
		});
		if (!parsed.success) {
			return fail(400, {
				eventError: parsed.error.issues[0].message,
				values: {
					title: String(form.get('title') ?? ''),
					series: String(form.get('series') ?? ''),
					date: String(form.get('date') ?? ''),
					time: String(form.get('time') ?? ''),
					location: String(form.get('location') ?? ''),
					description: String(form.get('description') ?? ''),
					url: String(form.get('url') ?? ''),
					hosts: hostsRaw
				}
			});
		}

		const seriesId = await resolveSeriesId(parsed.data.series, userId);
		const personIds = await resolvePersonIds(parsed.data.hosts, userId);

		await db
			.update(event)
			.set({
				title: parsed.data.title,
				seriesId,
				date: parsed.data.date,
				time: nullIfEmpty(parsed.data.time),
				location: nullIfEmpty(parsed.data.location),
				description: nullIfEmpty(parsed.data.description),
				url: nullIfEmpty(parsed.data.url),
				...stampUpdate(userId)
			})
			.where(eq(event.id, id.data));

		// Resync host links: drop the old set, insert the new one.
		await db.delete(eventHost).where(eq(eventHost.eventId, id.data));
		if (personIds.length > 0) {
			await db.insert(eventHost).values(
				personIds.map((personId) => ({
					eventId: id.data,
					personId,
					...stampInsert(userId)
				}))
			);
		}

		// Back to the event page so the edits show.
		throw redirect(303, `/keeper/events/${id.data}`);
	},

	deleteEvent: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { eventError: 'Sign in to delete an event' });
		// Server-side role gate — the UI hides the button, but this is the enforcement.
		if (locals.user.role !== 'admin') {
			return fail(403, { eventError: 'Only admins can delete events' });
		}

		const id = idSchema.safeParse(params.id);
		if (!id.success) return fail(400, { eventError: 'Unknown event' });

		// Artefacts reference this event (nullable, no cascade) — unlink them first
		// so the delete doesn't trip the foreign key. Host links cascade on their own.
		await db
			.update(artefact)
			.set({ eventId: null, ...stampUpdate(locals.user.id) })
			.where(eq(artefact.eventId, id.data));
		await db.delete(event).where(eq(event.id, id.data));
		// Nothing left to show here — back to the events list.
		throw redirect(303, '/keeper/events');
	}
};
