/**
 * Pure helpers for reading the U Street community site (Squarespace): its
 * sitemap, and the JSON Squarespace serves for any page when `?format=json` is
 * appended. Network-free so it is unit-tested; the CLIs in this folder do the
 * fetching and file I/O.
 */
import { decodeHTML } from 'entities';
import { Parser } from 'htmlparser2';
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
		const urls = [...source.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => decodeHTML(m[1]));
		return [...new Set(urls.filter((u) => EVENT_URL.test(u)))];
	};
	const direct = extract(xml);
	return direct.length > 0 ? direct : extract(decodeHTML(xml.replace(/<[^>]+>/g, '')));
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
 * An event as the site publishes it, before curation. `title` and
 * `description` are the page's own words and go into the archive unedited (see
 * `verbatimText`); the rest feeds the fields curation decides with judgment.
 */
export type RawEvent = {
	url: string;
	/**
	 * The page's title, exactly as published: Squarespace serves titles
	 * HTML-escaped ("Seeds &amp; Snacks"), so entities are decoded and outer
	 * whitespace trimmed, nothing else.
	 */
	title: string;
	/** ISO `YYYY-MM-DD` in the site's time zone. */
	date: string;
	/** e.g. "6:00 PM - 7:30 PM", the house format. */
	time: string;
	location: string | null;
	/**
	 * The page's description, word for word: the body text, or the excerpt when
	 * the body has none, or null when the page has neither.
	 */
	description: string | null;
	bodyText: string;
	excerptText: string;
	tags: string[];
	categories: string[];
};

export function toRawEvent(url: string, item: SquarespaceItem, timeZone: string): RawEvent {
	const bodyText = htmlToText(item.body ?? '');
	const excerptText = htmlToText(item.excerpt ?? '');
	return {
		url,
		title: decodeHTML(item.title).trim(),
		date: formatDate(item.startDate, timeZone),
		time: formatTimeSpan(item.startDate, item.endDate ?? null, timeZone),
		location: formatLocation(item.location ?? null),
		description: bodyText || excerptText || null,
		bodyText,
		excerptText,
		tags: item.tags ?? [],
		categories: item.categories ?? []
	};
}

/**
 * The two fields the archive keeps exactly as the source page wrote them. Every
 * step that writes an event's title or description (curate, import, restore)
 * takes them from here, and the import refuses entries that differ from it.
 */
export function verbatimText(raw: RawEvent): { title: string; description: string | null } {
	return { title: raw.title, description: raw.description };
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

/** Elements whose contents are never visible page text. */
const HIDDEN = new Set([
	'script',
	'style',
	'noscript',
	'template',
	'svg',
	'iframe',
	'head',
	'title'
]);

/** Elements that start a new paragraph (a blank line in the text). */
const PARAGRAPH = new Set([
	'p',
	'div',
	'section',
	'article',
	'header',
	'footer',
	'aside',
	'main',
	'nav',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'blockquote',
	'pre',
	'ul',
	'ol',
	'dl',
	'figure',
	'figcaption',
	'table',
	'hr',
	'form',
	'fieldset'
]);

/** Elements that start a new line within a paragraph. */
const LINE = new Set(['li', 'dt', 'dd', 'tr']);

// Private-use markers for breaks while text is collected, resolved at the end
// so runs of nested wrappers collapse into a single break. A structural line
// (a list item, a block inside one) never doubles up; a visible line (`<br>`,
// a pre-wrap newline) does, since two in a row is an empty line on the page.
const LINE_MARK = '\u{F0001}';
const VISIBLE_LINE_MARK = '\u{F0003}';
const PARAGRAPH_MARK = '\u{F0002}';

/** True when an inline style keeps the element's own line breaks visible. */
const keepsNewlines = (style: string | undefined) =>
	!!style && /white-space\s*:\s*(pre|pre-wrap|pre-line|break-spaces)\b/i.test(style);

/**
 * The visible text of a page body, word for word, as the archive stores an
 * event description. Parsed with a real HTML parser rather than patterns, so
 * attributes containing `>`, unclosed tags and entities can't leak markup or
 * drop words.
 *
 * Kept: every visible word, in order, including link, button and caption text.
 * Paragraphs and blocks become blank-line breaks, `<br>` and list items line
 * breaks (list items prefixed "• "), and line breaks the page shows through
 * `white-space: pre-wrap` stay line breaks. Dropped: markup, scripts, styles,
 * hidden fallbacks, and layout whitespace (runs of spaces collapse to one,
 * lines are trimmed). Event descriptions render with `whitespace-pre-line`, so
 * the breaks survive on the site.
 */
export function htmlToText(html: string): string {
	let out = '';
	let hiddenDepth = 0;
	// Inside a list item, blocks (Squarespace wraps each item's text in a <p>)
	// only start a new line, and the bullet waits for the item's first word.
	let listItemDepth = 0;
	let bulletPending = false;
	const blockBreak = () => (listItemDepth > 0 ? LINE_MARK : PARAGRAPH_MARK);
	// One entry per open element: whether it (or an ancestor) keeps newlines.
	const preStack: boolean[] = [];

	const parser = new Parser(
		{
			onopentag(name, attribs) {
				const inPre = preStack.at(-1) ?? false;
				preStack.push(inPre || name === 'pre' || keepsNewlines(attribs.style));
				if (HIDDEN.has(name)) hiddenDepth++;
				if (hiddenDepth > 0) return;
				if (PARAGRAPH.has(name)) out += blockBreak();
				else if (LINE.has(name)) out += LINE_MARK;
				else if (name === 'br') out += VISIBLE_LINE_MARK;
				if (name === 'li') {
					listItemDepth++;
					bulletPending = true;
				}
			},
			ontext(text) {
				if (hiddenDepth > 0) return;
				const inPre = preStack.at(-1) ?? false;
				if (bulletPending && /\S/.test(text)) {
					out += '\u2022 ';
					text = text.trimStart();
					bulletPending = false;
				}
				out += inPre ? text.replace(/\r\n?|\n/g, VISIBLE_LINE_MARK) : text.replace(/\s+/g, ' ');
			},
			onclosetag(name) {
				preStack.pop();
				if (HIDDEN.has(name)) {
					hiddenDepth = Math.max(0, hiddenDepth - 1);
					return;
				}
				if (hiddenDepth > 0) return;
				if (name === 'li') {
					listItemDepth = Math.max(0, listItemDepth - 1);
					bulletPending = false;
				}
				if (PARAGRAPH.has(name)) out += blockBreak();
			}
		},
		{ decodeEntities: true, lowerCaseTags: true }
	);
	parser.write(html);
	parser.end();

	const marks = `${LINE_MARK}${VISIBLE_LINE_MARK}${PARAGRAPH_MARK}`;
	const breaks = new RegExp(`[^\\S\\n]*[${marks}][\\s${marks}]*`, 'gu');
	return out
		.replace(breaks, (run) => {
			// A paragraph break, or two line breaks in a row (an empty line the page
			// shows), is a blank line; a single line break is a newline.
			const lines = [...run].filter((c) => c === VISIBLE_LINE_MARK).length;
			return run.includes(PARAGRAPH_MARK) || lines >= 2 ? '\n\n' : '\n';
		})
		.split('\n')
		.map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}
