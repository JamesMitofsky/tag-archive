/**
 * The curation step's prompt and its post-processing, kept pure so they are
 * unit-tested and so the system prompt is byte-stable across a run: it is built
 * once from the seed file and prompt-cached, so every event after the first
 * pays only for its own page text.
 *
 * Code copies the fields a page states outright (title, date, time, location,
 * URL). Claude writes the fields the existing catalogue was written with
 * judgment: the short description, the hosts named in the text, the series
 * banner, and the review flag.
 */
import { z } from 'zod';
import type { EventSource } from '../db/seed-core';
import type { RawEvent } from './squarespace';

/** Bump when the prompt or schema changes, so cached curations are redone. */
export const PROMPT_VERSION = 1;

/** A series banner exists once its key covers this many events (as in seed-core). */
const SERIES_MIN_EVENTS = 5;

/** What Claude returns for one event. */
export const curationSchema = z.object({
	description: z.string(),
	hosts: z.array(z.string()),
	series: z.string().nullable(),
	mayHaveException: z.boolean(),
	possibleExceptionDescription: z.string().nullable()
});
export type Curation = z.infer<typeof curationSchema>;

export type SeriesInfo = {
	name: string;
	count: number;
	lastDate: string;
	/** Most frequent hosts, most frequent first. */
	usualHosts: string[];
	usualTime: string | null;
	/** Distinct event titles filed under the banner, when not just its name. */
	otherTitles: string[];
};

const top = (values: string[], n: number) => {
	const counts = new Map<string, number>();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, n)
		.map(([v]) => v);
};

/** The recurring banners in the seed, keyed the way `seedArchive` keys them. */
export function seriesCatalog(events: EventSource[]): SeriesInfo[] {
	const byKey = new Map<string, EventSource[]>();
	for (const e of events) {
		const key = e.series?.trim() || e.title.trim();
		byKey.set(key, [...(byKey.get(key) ?? []), e]);
	}
	return [...byKey.entries()]
		.filter(([, group]) => group.length >= SERIES_MIN_EVENTS)
		.map(([name, group]) => ({
			name,
			count: group.length,
			lastDate: group
				.map((e) => e.date)
				.sort()
				.at(-1)!,
			usualHosts: top(
				group.flatMap((e) => e.hosts),
				3
			),
			usualTime: top(group.map((e) => e.time ?? '').filter(Boolean), 1)[0] ?? null,
			otherTitles: [...new Set(group.map((e) => e.title.trim()))]
				.filter((t) => t !== name)
				.sort()
				.slice(0, 5)
		}))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * A spread of recent finished entries to show the house style: some with
 * hosts, some flagged for review, some under a curated series name, some with
 * neither. Deterministic, so the system prompt (and its cache) is stable.
 */
export function styleExamples(events: EventSource[]): EventSource[] {
	const recent = events
		.filter((e) => e.url && e.description && e.date >= '2025-01-01')
		.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
	const picked = new Set<EventSource>();
	const take = (pred: (e: EventSource) => boolean, n: number) => {
		for (const e of recent.filter((e) => !picked.has(e) && pred(e)).slice(0, n)) picked.add(e);
	};
	take((e) => !!e.series, 2);
	take((e) => !!e.mayHaveException && e.hosts.length === 0, 2);
	take((e) => !!e.mayHaveException && e.hosts.length > 0, 2);
	take((e) => !e.mayHaveException && e.hosts.length > 0, 4);
	take((e) => !e.mayHaveException && e.hosts.length === 0, 2);
	return [...picked].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildSystemPrompt(events: EventSource[]): string {
	const catalog = seriesCatalog(events)
		.map((s) => {
			const parts = [`${s.count} events, latest ${s.lastDate}`];
			if (s.usualTime) parts.push(`usually ${s.usualTime}`);
			parts.push(s.usualHosts.length ? `usual hosts: ${s.usualHosts.join(', ')}` : 'no usual host');
			if (s.otherTitles.length) parts.push(`also titled: ${s.otherTitles.join(' | ')}`);
			return `- ${s.name} (${parts.join('; ')})`;
		})
		.join('\n');
	const examples = styleExamples(events)
		.map((e) => JSON.stringify(e))
		.join('\n');

	return `You catalogue events for the archive of the Temperance Alley Garden (TAG), a community garden in the alley between 12th & 13th and T & U Streets NW in Washington, DC. Each event page from the U Street community website (ustreetcommunity.org) becomes one catalogue entry. Code has already copied the title, date, time, location and URL from the page. You write the remaining fields so they read like the rest of the catalogue.

Fields you return:

description: One to three sentences, usually 30 to 70 words, saying what happens at the event, who it is for, and any practical notes the page gives attendees (what to bring, cost, accessibility, partner organizations). Write it in the third person, in your own words, in US English, and keep names and short direct quotes exactly as the page writes them. Do not restate the date, time or address. Do not add anything the page does not say. If the page has no real description, write one plain sentence from the title and flag the entry.

hosts: The people, or named groups such as "Zoe & Friends", that the page credits with hosting, leading, facilitating or performing, written as the page writes them (a first name alone is fine). Include an organization only when the page presents it as the host and names no person. Leave out partners, sponsors and venues. Return an empty list when nobody is named.

series: When the event is one occurrence of a recurring banner listed below, that banner's exact name; otherwise null. Match on what the event is, not just shared words: "Music in the Garden ft. Yaddiya" belongs to "Music in the Garden", but a one-off concert does not. Never invent a banner that is not in the list.

mayHaveException and possibleExceptionDescription: Flag the entry (true) when a keeper should double-check it: the page names no host where the series usually has one, the event was canceled, postponed, rain-dated, moved or shortened, its time differs from the series' usual time, it is a one-off or first session of something new, the page is a placeholder, or the page contradicts itself. possibleExceptionDescription is then a short phrase in sentence case with no final period and under 10 words, for example "No host listed, unlike similar sessions" or "Canceled due to rain". Otherwise return false and null.

Recurring series banners in the archive:
${catalog}

Finished catalogue entries, as examples of the house style (one JSON object per line):
${examples}`;
}

/** The per-event message: the page as code read it. */
export function buildUserMessage(raw: RawEvent): string {
	const weekday = new Date(`${raw.date}T12:00:00Z`).toLocaleDateString('en-US', {
		weekday: 'long',
		timeZone: 'UTC'
	});
	const page = {
		title: raw.title,
		date: raw.date,
		weekday,
		time: raw.time,
		location: raw.location,
		tags: raw.tags,
		categories: raw.categories,
		excerpt: raw.excerptText,
		body: raw.bodyText
	};
	return `Catalogue this event page:\n\n${JSON.stringify(page, null, 2)}`;
}

/**
 * Combine the code-copied fields with Claude's, enforcing what the prompt asks
 * for rather than trusting it: unknown banners are dropped, host names are
 * trimmed and deduped, and a review note only survives on a flagged entry.
 * Returns warnings for anything it had to correct.
 */
export function toEventSource(
	raw: RawEvent,
	curation: Curation,
	knownSeries: Set<string>
): { event: EventSource; warnings: string[] } {
	const warnings: string[] = [];
	let seriesName = curation.series?.trim() || null;
	if (seriesName && !knownSeries.has(seriesName)) {
		warnings.push(`dropped unknown series "${seriesName}"`);
		seriesName = null;
	}
	const hosts = [...new Set(curation.hosts.map((h) => h.trim()).filter(Boolean))];
	const note = curation.possibleExceptionDescription?.trim().replace(/\.$/, '') || null;
	const flagged = curation.mayHaveException || false;
	if (flagged && !note) warnings.push('flagged without a note');

	return {
		warnings,
		event: {
			title: raw.title,
			...(seriesName ? { series: seriesName } : {}),
			date: raw.date,
			time: raw.time,
			location: raw.location,
			description: curation.description.trim() || null,
			hosts,
			url: raw.url,
			mayHaveException: flagged,
			...(flagged && note ? { possibleExceptionDescription: note } : {})
		}
	};
}

/**
 * The no-Claude fallback: copy what the page says and flag every entry, since
 * hosts and a summary need a person (or a later curated run) to fill in.
 */
export function uncuratedEventSource(raw: RawEvent, knownSeries: Set<string>): EventSource {
	const text = raw.excerptText || raw.bodyText;
	const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
	let description = '';
	for (const s of sentences) {
		if (description && (description + s).length > 400) break;
		description += s;
	}
	return {
		title: raw.title,
		...(knownSeries.has(raw.title) ? { series: raw.title } : {}),
		date: raw.date,
		time: raw.time,
		location: raw.location,
		description: description.trim() || null,
		hosts: [],
		url: raw.url,
		mayHaveException: true,
		possibleExceptionDescription: 'Not curated; check description and hosts'
	};
}
