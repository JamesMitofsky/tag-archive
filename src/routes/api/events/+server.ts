import { json } from '@sveltejs/kit';
import { eq, getTableColumns, inArray, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachHosts } from '$lib/server/db/queries';
import { event, eventHost, person } from '$lib/server/db/schema';
import type { EventItem } from '$lib/events';
import type { RequestHandler } from './$types';

/**
 * Substring search (case-insensitive) over the U Street events in the DB.
 * Mirrors /api/search: matches the term in the event's own columns, plus its
 * hosts (a normalised person table reached via the event_host join). Empty
 * query returns nothing, matching the archive search's fetch-on-keystroke flow.
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (!q) return json({ results: [] });

	// Escape LIKE wildcards so user input is matched literally (see ESCAPE below).
	const term = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
	// SQLite LIKE is case-insensitive for ASCII. Backslash is the escape char
	// (written '\\' so the template literal emits a single literal backslash).
	const matches = (col: unknown) => sql`${col} LIKE ${term} ESCAPE '\\'`;

	// Find all matching events in a single pass across title, description, location, and host person names.
	const rows = await db
		.selectDistinct(getTableColumns(event))
		.from(event)
		.leftJoin(eventHost, eq(event.id, eventHost.eventId))
		.leftJoin(person, eq(person.id, eventHost.personId))
		.where(
			or(
				matches(event.title),
				matches(event.description),
				matches(event.location),
				matches(person.name)
			)
		);

	const withHosts = await attachHosts(rows);

	const results: EventItem[] = withHosts.map((e) => ({
		id: e.id,
		title: e.title,
		date: e.date,
		time: e.time,
		location: e.location,
		description: e.description,
		hosts: e.hosts,
		url: e.url
	}));

	return json({ results });
};
