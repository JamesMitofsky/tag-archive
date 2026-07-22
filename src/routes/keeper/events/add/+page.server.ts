import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { purgeArchiveCache } from '$lib/server/cache';
import { resolvePersonIds, resolveSeriesId } from '$lib/server/db/queries';
import { stampInsert } from '$lib/server/db/audit';
import { isProposedAddition } from '$lib/server/db/proposals';
import { event, eventHost, person, series } from '$lib/server/db/schema';
import { createEventSuite, parseEventForm } from '$lib/validation/event';
import { summary } from '$lib/validation/helpers';
import type { Actions, PageServerLoad } from './$types';

/** Raw (unvalidated) create-form values echoed back so a failed submit keeps input. */
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

export const load: PageServerLoad = async ({ locals }) => {
	// The create form is signed-in only; bounce guests back to the keeper page.
	if (!locals.user) throw redirect(303, '/keeper');

	// Existing series names + people power the searchable datalists.
	const seriesList = await db.select({ name: series.name }).from(series).orderBy(series.name);
	const hostPeople = await db.select().from(person).orderBy(person.name);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		series: seriesList,
		hostPeople
	};
};

export const actions: Actions = {
	createEvent: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { eventError: 'Sign in to add an event' });
		const userId = locals.user.id;

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

		// Find-or-create the series banner, then find-or-create the host people and
		// link by id (repeat hosts reuse one person row each).
		const seriesId = await resolveSeriesId(data.series, userId);
		const personIds = await resolvePersonIds(data.hosts, userId);

		// id is an INTEGER PRIMARY KEY (rowid alias) — omit it and SQLite assigns the next one.
		const [created] = await db
			.insert(event)
			.values({
				title: data.title,
				seriesId,
				date: data.date,
				time: nullIfEmpty(data.time),
				location: nullIfEmpty(data.location),
				description: nullIfEmpty(data.description),
				url: nullIfEmpty(data.url),
				proposedAddition: isProposedAddition(locals.user.role),
				...stampInsert(userId)
			})
			.returning({ id: event.id });

		if (personIds.length > 0) {
			await db.insert(eventHost).values(
				personIds.map((personId) => ({
					eventId: created.id,
					personId,
					...stampInsert(userId)
				}))
			);
		}

		await purgeArchiveCache();

		// Land back on the events list so the new event shows.
		throw redirect(303, '/keeper/events');
	}
};
