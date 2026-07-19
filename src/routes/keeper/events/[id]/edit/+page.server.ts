import { error, fail, redirect } from '@sveltejs/kit';
import { eq, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachHosts, resolvePersonIds, resolveSeriesId } from '$lib/server/db/queries';
import { stampInsert, stampUpdate } from '$lib/server/db/audit';
import { artefact, event, eventHost, person, series } from '$lib/server/db/schema';
import { idSchema } from '$lib/schemas';
import { createEventSuite, parseEventForm } from '$lib/validation/event';
import { summary } from '$lib/validation/helpers';
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
		const data = parseEventForm(form);
		const result = createEventSuite()(data);
		if (!result.isValid()) {
			return fail(400, {
				eventError: summary(result),
				errors: result.getErrors(),
				values: {
					title: String(form.get('title') ?? ''),
					series: String(form.get('series') ?? ''),
					date: String(form.get('date') ?? ''),
					time: String(form.get('time') ?? ''),
					location: String(form.get('location') ?? ''),
					description: String(form.get('description') ?? ''),
					url: String(form.get('url') ?? ''),
					hosts: String(form.get('hosts') ?? '')
				}
			});
		}

		const seriesId = await resolveSeriesId(data.series, userId);
		const personIds = await resolvePersonIds(data.hosts, userId);

		await db
			.update(event)
			.set({
				title: data.title,
				seriesId,
				date: data.date,
				time: nullIfEmpty(data.time),
				location: nullIfEmpty(data.location),
				description: nullIfEmpty(data.description),
				url: nullIfEmpty(data.url),
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
