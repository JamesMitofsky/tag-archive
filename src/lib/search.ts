/**
 * Client-side archive search. The public pages download the whole (small) dataset
 * once and filter it here as the user types — no per-keystroke network. These
 * mirror the substring/token rules the old server endpoints ran in SQL so results
 * match the previous behaviour exactly.
 */
import type { ArtefactWithEvent } from '#lib/server/db/schema.ts';
import type { EventItem } from '#lib/events.ts';
import type { PublicImageSet } from '#lib/images/types.ts';
import type { ImageCard, PhotoCard } from '#lib/images/cards.ts';
import { imageSetLabel } from '#lib/images/label.ts';
import { formatPartialDate, startOfPartialDate } from '#lib/partialDate.ts';

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
 * Image sets: tokenized AND, like artefacts. A set has no title of its own, so
 * its derived label stands in for one (which only adds anything when the label
 * is the photograph count), alongside the event title and the description. The
 * date is searched both as stored and as read, so `2024-07` and `July 2024`
 * alike find a set dated 2024-07-12. The count is deliberately not searched on
 * every set: its digits would match date queries ("May 3") on sets of 3.
 */
export function filterImageSets(rows: PublicImageSet[], q: string): PublicImageSet[] {
	const tokens = tokenize(q);
	if (tokens.length === 0) return [];

	return rows.filter((row) => {
		const fields = haystack([
			imageSetLabel(row),
			row.event,
			row.description,
			row.date,
			row.date && formatPartialDate(row.date)
		]);
		return tokens.every((token) => fields.some((field) => field.includes(token)));
	});
}

/**
 * /images's search (see #lib/images/cards). Sets whose own words match, by
 * `filterImageSets`'s rules, come first, as piles. Then the photographs that
 * show what was asked for, best first, each loose, as `contentMatches` ranks
 * them. A photograph can be in both: its set matched by its words, and the
 * photograph by what it shows.
 *
 * Content search is a bonus on top of the words, never a condition for them:
 * if it fails (offline, the model unreachable), the word matches stand alone.
 * An aborted search throws, as the cloud expects of a query it has moved past.
 */
export async function searchImageCards(
	cards: ImageCard[],
	q: string,
	contentMatches: (q: string, signal: AbortSignal) => Promise<{ id: number }[]>,
	signal: AbortSignal
): Promise<ImageCard[]> {
	const setCards = cards.filter((card) => card.kind === 'set');
	const bySet = new Map(setCards.map((card) => [card.set, card]));
	const byWords = filterImageSets(
		setCards.map((card) => card.set),
		q
	).map((set) => bySet.get(set)!);

	let matches: { id: number }[];
	try {
		matches = await contentMatches(q, signal);
	} catch (e) {
		if (signal.aborted) throw e;
		console.error('[search] content search failed; searching by words alone', e);
		matches = [];
	}
	const photos = new Map<number, PhotoCard>();
	for (const card of cards) if (card.kind === 'photo') photos.set(card.photo.id, card);
	// An id the dataset doesn't hold (a photograph vetted or removed since the
	// dataset was cached) is skipped: there is nothing to draw it with.
	const loose = matches.flatMap((match) => photos.get(match.id) ?? []);
	return [...byWords, ...loose];
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

/** One row of the event picker: a single dated occurrence of an event title. */
export type EventOption = { id: number; name: string; date: string | null };

/**
 * Event picker rows: substring search across event titles, sorted by date
 * proximity to targetDate (if provided).
 *
 * A recurring title ("Temperance Alley Beautification", four Saturdays running)
 * is one event row per date, and an artefact belongs to one of them, so each
 * occurrence is its own option, carrying its row's id for the form to post.
 * Only exact repeats (same title, same date) collapse: they are the same choice
 * as far as anyone picking can tell. The first in sort order is kept.
 */
export function filterAndSortEvents(
	events: EventItem[],
	q: string,
	targetDate?: string
): EventOption[] {
	const term = q.trim().toLowerCase();
	const matched = term ? events.filter((e) => e.title.toLowerCase().includes(term)) : [...events];

	// The artefact form's date may be vague (`2019`, `2019-07`). Widen it to the
	// first day of the span it covers before measuring distance: for ranking
	// "somewhere in July 2019" by nearness, July 1st is a sound stand-in, and the
	// widened value is used for nothing else. Explicit rather than leaning on
	// `new Date('2019-07')` happening to land there.
	if (targetDate) {
		const anchor = startOfPartialDate(targetDate);
		const targetMs = anchor ? new Date(anchor).getTime() : NaN;
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
	const result: EventOption[] = [];
	for (const e of matched) {
		// JSON of the pair, so no title can run into its date and fake another key.
		const key = JSON.stringify([e.title, e.date]);
		if (!seen.has(key)) {
			seen.add(key);
			result.push({ id: e.id, name: e.title, date: e.date });
		}
	}
	return result;
}
