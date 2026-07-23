/**
 * Client-side archive search. The public pages download the whole (small) dataset
 * once and filter it here as the user types — no per-keystroke network. These
 * mirror the substring/token rules the old server endpoints ran in SQL so results
 * match the previous behaviour exactly.
 */
import type { ArtefactWithEvent } from '$lib/server/db/schema';
import type { EventItem } from '$lib/events';

/** Lowercased, whitespace-split, empty-dropped query tokens. */
function tokenize(q: string): string[] {
	return q.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** Build a lowercase haystack from a row's searchable fields (nulls dropped). */
function haystack(parts: (string | null | undefined)[]): string[] {
	return parts.filter((p): p is string => Boolean(p)).map((p) => p.toLowerCase());
}

/**
 * Artefacts: tokenized AND — every token must appear in at least one field.
 * Fields mirror the old `/api/search`: artefact title, linked event title,
 * program areas, description, and provenance contributor names.
 */
export function filterArtefacts(rows: ArtefactWithEvent[], q: string): ArtefactWithEvent[] {
	const tokens = tokenize(q);
	if (tokens.length === 0) return [];

	return rows.filter((row) => {
		const fields = haystack([
			row.artefact,
			row.event,
			row.description,
			...(row.programArea ?? []),
			...(row.provenance ?? [])
		]);
		return tokens.every((token) => fields.some((field) => field.includes(token)));
	});
}

/**
 * Events: single-term substring across title, description, location, and host
 * names — mirrors the old `/api/events`.
 */
export function filterEvents(rows: EventItem[], q: string): EventItem[] {
	const term = q.trim().toLowerCase();
	if (!term) return [];

	return rows.filter((row) => {
		const fields = haystack([row.title, row.description, row.location, ...(row.hosts ?? [])]);
		return fields.some((field) => field.includes(term));
	});
}

/**
 * People: substring search across person names.
 */
export function filterPeople(names: string[], q: string): string[] {
	const term = q.trim().toLowerCase();
	if (!term) return names;
	return names.filter((name) => name.toLowerCase().includes(term));
}

/**
 * Event titles: substring search across event titles, sorted by date proximity
 * to targetDate (if provided).
 */
export function filterAndSortEvents(
	events: EventItem[],
	q: string,
	targetDate?: string
): { name: string; date: string | null }[] {
	const term = q.trim().toLowerCase();
	const matched = term ? events.filter((e) => e.title.toLowerCase().includes(term)) : [...events];

	if (targetDate) {
		const targetMs = new Date(targetDate).getTime();
		if (!isNaN(targetMs)) {
			matched.sort((a, b) => {
				const aMs = a.date ? new Date(a.date).getTime() : Infinity;
				const bMs = b.date ? new Date(b.date).getTime() : Infinity;
				const aDiff = isNaN(aMs) ? Infinity : Math.abs(aMs - targetMs);
				const bDiff = isNaN(bMs) ? Infinity : Math.abs(bMs - targetMs);
				return aDiff - bDiff;
			});
		}
	}

	const seen = new Set<string>();
	const result: { name: string; date: string | null }[] = [];
	for (const e of matched) {
		if (!seen.has(e.title)) {
			seen.add(e.title);
			result.push({ name: e.title, date: e.date });
		}
	}
	return result;
}
