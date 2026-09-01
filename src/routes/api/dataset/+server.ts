import { json } from '@sveltejs/kit';
import { eq, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachHosts, attachProvenance } from '$lib/server/db/queries';
import { artefact, event, person } from '$lib/server/db/schema';
import { ARCHIVE_CACHE_HEADERS } from '$lib/server/cache';
import type { EventItem } from '$lib/events';
import type { RequestHandler } from './$types';

/**
 * The entire archive dataset as one blob: all artefacts, events, and person names.
 * The dataset is small, so client components fetch this once and search it client-side.
 *
 * Cached at Netlify's edge under the shared `archive` tag; every keeper write
 * purges it (see `$lib/server/cache`).
 */

export const GET: RequestHandler = async () => {
	const artefactRows = await db
		.select({ ...getTableColumns(artefact), event: event.title })
		.from(artefact)
		.leftJoin(event, eq(artefact.eventId, event.id));
	const artefacts = await attachProvenance(artefactRows);

	const eventRows = await attachHosts(await db.select(getTableColumns(event)).from(event));
	const events: EventItem[] = eventRows.map((e) => ({
		id: e.id,
		title: e.title,
		date: e.date,
		time: e.time,
		location: e.location,
		description: e.description,
		hosts: e.hosts,
		url: e.url
	}));

	const personRows = await db.select({ name: person.name }).from(person);
	const people = personRows.map((p) => p.name);

	return json({ artefacts, events, people }, { headers: ARCHIVE_CACHE_HEADERS });
};
