/**
 * The archive keeps every event's title and description exactly as its page on
 * ustreetcommunity.org wrote them. This is the check that holds the pipeline
 * to it: anything about to be written is compared with the saved page, and a
 * title or description that differs — paraphrased, summarized, "tidied" — is
 * refused rather than imported.
 */
import type { EventSource } from '../db/seed-core';
import { parseEventPage, toRawEvent, verbatimText, type RawEvent } from './squarespace';
import { RAW_DIR, listJson, readJson, type RawFile } from './workspace';

/** The text fields the archive keeps word for word. */
export type VerbatimText = { title: string; description: string | null };

/** Saved pages in temp/events-import/raw/, read into events, keyed by URL. */
export function loadRawEvents(dir = RAW_DIR): {
	byUrl: Map<string, RawEvent>;
	unreadable: { path: string; error: string }[];
} {
	const byUrl = new Map<string, RawEvent>();
	const unreadable: { path: string; error: string }[] = [];
	for (const path of listJson(dir)) {
		const file = readJson<RawFile>(path);
		try {
			const { item, timeZone } = parseEventPage(file.page);
			byUrl.set(file.url, toRawEvent(file.url, item, timeZone));
		} catch (err) {
			unreadable.push({ path, error: err instanceof Error ? err.message : String(err) });
		}
	}
	return { byUrl, unreadable };
}

/** Equal as the archive stores them: titles are trimmed, an empty description is none. */
export function sameText(
	a: VerbatimText,
	b: VerbatimText
): { title: boolean; description: boolean } {
	return {
		title: a.title.trim() === b.title.trim(),
		description: (a.description || null) === (b.description || null)
	};
}

export type TextMismatch = {
	url: string | null;
	date: string;
	title: string;
	problem: 'no-saved-page' | 'title-differs' | 'description-differs';
	/** The page's own words, when there is a saved page. */
	expected?: string | null;
	actual?: string | null;
};

/**
 * Every way `entries` departs from their saved pages. Empty means each entry's
 * title and description are its page's, word for word. An entry with no saved
 * page can't be checked, so it is a mismatch too.
 */
export function verbatimMismatches(
	entries: EventSource[],
	rawByUrl: Map<string, RawEvent>
): TextMismatch[] {
	const out: TextMismatch[] = [];
	for (const e of entries) {
		const raw = e.url ? rawByUrl.get(e.url) : undefined;
		const base = { url: e.url, date: e.date, title: e.title };
		if (!raw) {
			out.push({ ...base, problem: 'no-saved-page' });
			continue;
		}
		const source = verbatimText(raw);
		const same = sameText(e, source);
		if (!same.title) {
			out.push({ ...base, problem: 'title-differs', expected: source.title, actual: e.title });
		}
		if (!same.description) {
			out.push({
				...base,
				problem: 'description-differs',
				expected: source.description,
				actual: e.description
			});
		}
	}
	return out;
}
