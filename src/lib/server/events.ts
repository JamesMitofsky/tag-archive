import raw from '$lib/data/seed-data.json';
import type { EventItem } from '$lib/events';

// Shape of a single record in the source export.
interface RawEvent {
	title: string;
	date?: string;
	time?: string;
	location?: string;
	description?: string;
	hosts?: string[];
	url?: string;
}

// Normalise once at module load: assign a stable id (source index) and coerce
// missing fields to null/[] so the page can render optimistically.
export const EVENTS: EventItem[] = (raw as RawEvent[]).map((e, i) => ({
	id: i,
	title: e.title,
	date: e.date ?? null,
	time: e.time ?? null,
	location: e.location ?? null,
	description: e.description ?? null,
	hosts: e.hosts ?? [],
	url: e.url ?? null
}));

/**
 * Case-insensitive substring search across title, description, location and
 * hosts. Empty query returns nothing (matches the archive search's behaviour).
 */
export function searchEvents(q: string): EventItem[] {
	const term = q.trim().toLowerCase();
	if (!term) return [];
	return EVENTS.filter(
		(e) =>
			e.title.toLowerCase().includes(term) ||
			e.description?.toLowerCase().includes(term) ||
			e.location?.toLowerCase().includes(term) ||
			e.hosts.some((h) => h.toLowerCase().includes(term))
	);
}
