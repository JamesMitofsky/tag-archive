import { json } from '@sveltejs/kit';
import { eq, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachHosts, attachProvenance } from '$lib/server/db/queries';
import { artefact, event, person } from '$lib/server/db/schema';
import type { EventItem } from '$lib/events';
import type { RequestHandler } from './$types';

/**
 * The entire archive dataset as one blob: all artefacts, events, and person names.
 * The dataset is small, so client components fetch this once and search it client-side.
 *
 * Cached at Netlify's edge with a single `archive` tag; every keeper write purges
 * that tag (see `$lib/server/cache`). `s-maxage` is a self-healing backstop in case
 * a purge is ever missed — freshness normally comes from the purge, not the TTL.
 */
const CACHE_HEADERS = {
	'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400, stale-while-revalidate=604800',
	'Netlify-Cache-Tag': 'archive'
};

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

	return json({ artefacts, events, people }, { headers: CACHE_HEADERS });
};
