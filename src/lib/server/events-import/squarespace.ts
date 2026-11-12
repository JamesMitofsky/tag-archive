/**
 * Pure helpers for reading the U Street community site (Squarespace): its
 * sitemap, and the JSON Squarespace serves for any page when `?format=json` is
 * appended. Network-free so it is unit-tested; the CLIs in this folder do the
 * fetching and file I/O.
 */
import { z } from 'zod';

export const SITE_ORIGIN = 'https://www.ustreetcommunity.org';
export const SITEMAP_URL = `${SITE_ORIGIN}/sitemap.xml`;

/** The site's events are in DC; used when a response doesn't name its zone. */
export const DEFAULT_TIME_ZONE = 'America/New_York';

/** Matches one event page (not the `/events` listing itself). */
const EVENT_URL = /^https:\/\/www\.ustreetcommunity\.org\/events\/[^/?#]+$/;

/**
 * Every event page URL in a sitemap, in sitemap order, deduped. Accepts the raw
 * XML, or a browser's "view source" page saved from it, where the XML sits
 * entity-escaped inside highlighting markup and is unwrapped first.
 */
export function parseSitemapEventUrls(xml: string): string[] {
	const extract = (source: string) => {
		const urls = [...source.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) =>
			decodeEntities(m[1])
		);
		return [...new Set(urls.filter((u) => EVENT_URL.test(u)))];
	};
	const direct = extract(xml);
	return direct.length > 0 ? direct : extract(decodeEntities(xml.replace(/<[^>]+>/g, '')));
}

/** The last path segment of an event URL, used to name its workspace files. */
export function eventSlug(url: string): string {
	const slug = new URL(url).pathname.split('/').filter(Boolean).pop();
	if (!slug) throw new Error(`Not an event URL: ${url}`);
	return slug;
}

/** The URL that returns an event page's Squarespace JSON. */
export const jsonUrl = (url: string) => `${url}?format=json`;

// Squarespace's item JSON carries far more than this; only the fields the
// catalogue uses are validated (the rest is dropped here, but the fetch step
// keeps the full response on disk).
const locationSchema = z.object({
	addressTitle: z.string().nullish(),
	addressLine1: z.string().nullish(),
	addressLine2: z.string().nullish()
});

const itemSchema = z.object({
	title: z.string(),
	startDate: z.number(),
	endDate: z.number().nullish(),
	location: locationSchema.nullish(),
	body: z.string().nullish(),
	excerpt: z.string().nullish(),
	tags: z.array(z.string()).nullish(),
	categories: z.array(z.string()).nullish()
});

const pageSchema = z.object({
	website: z.object({ timeZone: z.string().nullish() }).nullish(),
	item: itemSchema
});

export type SquarespaceItem = z.infer<typeof itemSchema>;
export type SquarespaceLocation = z.infer<typeof locationSchema>;

/**
 * Validate a `?format=json` event page response. Throws with the zod issues when
 * the shape isn't an event item (e.g. the page isn't an event, or Squarespace
 * served something else), so a bad page fails loudly instead of importing junk.
 */
export function parseEventPage(json: unknown): { item: SquarespaceItem; timeZone: string } {
	const page = pageSchema.parse(json);
	return { item: page.item, timeZone: page.website?.timeZone || DEFAULT_TIME_ZONE };
}

/**
 * An event as the site publishes it, before curation: the fields the catalogue
 * takes verbatim, plus the page text the description and hosts are drawn from.
 */
export type RawEvent = {
	url: string;
	title: string;
	/** ISO `YYYY-MM-DD` in the site's time zone. */
	date: string;
	/** e.g. "6:00 PM - 7:30 PM", the house format. */
	time: string;
	location: string | null;
	bodyText: string;
	excerptText: string;
	tags: string[];
	categories: string[];
};

export function toRawEvent(url: string, item: SquarespaceItem, timeZone: string): RawEvent {
	return {
		url,
		title: item.title.trim(),
		date: formatDate(item.startDate, timeZone),
		time: formatTimeSpan(item.startDate, item.endDate ?? null, timeZone),
		location: formatLocation(item.location ?? null),
		bodyText: htmlToText(item.body ?? ''),
		excerptText: htmlToText(item.excerpt ?? ''),
		tags: item.tags ?? [],
		categories: item.categories ?? []
	};
}

/** Epoch ms → `YYYY-MM-DD` on the wall calendar of `timeZone`. */
export function formatDate(ms: number, timeZone: string): string {
	// en-CA formats dates as ISO `YYYY-MM-DD`.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(ms);
}

/** Epoch ms → `h:mm AM` on the wall clock of `timeZone`. */
export function formatClock(ms: number, timeZone: string): string {
	return (
		new Intl.DateTimeFormat('en-US', {
			timeZone,
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		})
			.format(ms)
			// Recent ICU puts a narrow no-break space before AM/PM; the catalogue
			// uses a plain space.
			.replace(/\s/g, ' ')
	);
}

/**
 * The catalogue's time format: "6:00 PM - 7:30 PM", or just the start when the
 * event has no distinct end. Most existing entries use a spaced hyphen, so new
 * ones do too.
 */
export function formatTimeSpan(start: number, end: number | null, timeZone: string): string {
	const from = formatClock(start, timeZone);
	if (end === null || end <= start) return from;
	const to = formatClock(end, timeZone);
	return to === from ? from : `${from} - ${to}`;
}

/**
 * "Title, line 1, line 2" from a Squarespace location, matching how existing
 * entries were written; null when the event has no address. Squarespace fills
 * an unset location with empty strings, which collapse to null here.
 */
export function formatLocation(location: SquarespaceLocation | null): string | null {
	if (!location) return null;
	const parts = [location.addressTitle, location.addressLine1, location.addressLine2]
		.map((p) => p?.trim() ?? '')
		.filter(Boolean);
	return parts.length > 0 ? parts.join(', ') : null;
}

const BLOCK_TAGS =
	/<\/?(?:p|div|br|li|ul|ol|h[1-6]|blockquote|section|article|figure|tr)\b[^>]*>/gi;

/**
 * Readable plain text from a page body: scripts and styles dropped, block
 * elements turned into line breaks, entities decoded, whitespace tidied. Only
 * feeds the curation step, so it aims for faithful text, not perfect layout.
 */
export function htmlToText(html: string): string {
	const text = html
		.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
		.replace(BLOCK_TAGS, '\n')
		.replace(/<[^>]+>/g, '');
	return decodeEntities(text)
		.split('\n')
		.map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
		.filter(Boolean)
		.join('\n');
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: '\u00a0',
	ndash: '\u2013',
	mdash: '\u2014',
	lsquo: '\u2018',
	rsquo: '\u2019',
	ldquo: '\u201c',
	rdquo: '\u201d',
	hellip: '\u2026'
};

export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
		if (code[0] === '#') {
			const n =
				code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
			return Number.isFinite(n) ? String.fromCodePoint(n) : match;
		}
		return NAMED_ENTITIES[code.toLowerCase()] ?? match;
	});
}
