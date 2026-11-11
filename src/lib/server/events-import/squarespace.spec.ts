import { describe, expect, it } from 'vitest';
import {
	eventSlug,
	formatLocation,
	formatTimeSpan,
	htmlToText,
	parseEventPage,
	parseSitemapEventUrls,
	toRawEvent,
	verbatimText
} from './squarespace';

const TZ = 'America/New_York';
/** Epoch ms for a wall-clock time in New York. */
const ny = (iso: string, offset: '-04:00' | '-05:00') => Date.parse(`${iso}${offset}`);

describe('parseSitemapEventUrls', () => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://www.ustreetcommunity.org/events</loc></url>
  <url><loc>https://www.ustreetcommunity.org/events/delete-day</loc></url>
  <url><loc>https://www.ustreetcommunity.org/about</loc></url>
  <url><loc>https://www.ustreetcommunity.org/events/delete-day</loc></url>
  <url><loc> https://www.ustreetcommunity.org/events/tags-6th-birthday-party- </loc></url>
</urlset>`;

	it('keeps event pages only, deduped, in order', () => {
		expect(parseSitemapEventUrls(xml)).toEqual([
			'https://www.ustreetcommunity.org/events/delete-day',
			'https://www.ustreetcommunity.org/events/tags-6th-birthday-party-'
		]);
	});

	it("reads a browser's saved view-source page of the sitemap", () => {
		const viewSource = `<html><body><span>&lt;<span class="start-tag">loc</span>&gt;</span><span>https://www.ustreetcommunity.org/events/delete-day</span><span>&lt;/<span class="end-tag">loc</span>&gt;</span></body></html>`;
		expect(parseSitemapEventUrls(viewSource)).toEqual([
			'https://www.ustreetcommunity.org/events/delete-day'
		]);
	});
});

describe('eventSlug', () => {
	it('is the last path segment', () => {
		expect(eventSlug('https://www.ustreetcommunity.org/events/death-cafe-3')).toBe('death-cafe-3');
	});
});

describe('formatTimeSpan', () => {
	it('uses the house "h:mm AM - h:mm PM" format with plain spaces', () => {
		const s = formatTimeSpan(
			ny('2026-10-03T18:00:00', '-04:00'),
			ny('2026-10-03T19:30:00', '-04:00'),
			TZ
		);
		expect(s).toBe('6:00 PM - 7:30 PM');
		expect(s).not.toMatch(/[\u202f\u00a0]/);
	});

	it('reads the wall clock in the site zone across DST', () => {
		// Same 18:00 local start in standard time (UTC-5).
		expect(formatTimeSpan(ny('2026-12-05T18:00:00', '-05:00'), null, TZ)).toBe('6:00 PM');
	});

	it('falls back to the start alone without a distinct end', () => {
		const start = ny('2026-10-03T09:30:00', '-04:00');
		expect(formatTimeSpan(start, start, TZ)).toBe('9:30 AM');
		expect(formatTimeSpan(start, start - 1000, TZ)).toBe('9:30 AM');
	});
});

describe('formatLocation', () => {
	it('joins the address parts like existing entries', () => {
		expect(
			formatLocation({
				addressTitle: 'True Reformer Building',
				addressLine1: '1200 U Street Northwest',
				addressLine2: 'Washington, DC 20009'
			})
		).toBe('True Reformer Building, 1200 U Street Northwest, Washington, DC 20009');
	});

	it("is null for Squarespace's empty placeholder location", () => {
		expect(formatLocation({ addressTitle: '', addressLine1: ' ', addressLine2: null })).toBeNull();
		expect(formatLocation(null)).toBeNull();
	});
});

describe('htmlToText', () => {
	it('keeps every word, paragraphs as blank lines, drops markup and scripts, decodes entities', () => {
		const html =
			'<div class="sqs-block"><p>Bring a mat &amp; water.&nbsp;</p><script>track()</script>' +
			'<p>Hosted by <strong>Zoe</strong> &#8211; all welcome</p><br><ul><li>Free</li></ul></div>';
		expect(htmlToText(html)).toBe(
			'Bring a mat & water.\n\nHosted by Zoe \u2013 all welcome\n\n\u2022 Free'
		);
	});

	it('reads a real Squarespace text block, ignoring its layout wrappers and styles', () => {
		const html =
			'<div class="sqs-layout" data-block-css="[&quot;https://x.css&quot;]"><div class="row">' +
			'<div class="sqs-block-content"><div class="sqs-html-content">' +
			'<p style="white-space:pre-wrap;">Join the Garden plants and critters for an evening of ' +
			'home-grown music \u2013\u2013 somewhere between a house show and barnyard jam.</p>' +
			'<p style="white-space:pre-wrap;">Bring a blanket to sit on and snacks to share :)</p>' +
			'<p style="white-space:pre-wrap;">produced by Lucy</p></div></div></div></div>' +
			'<style>#block-af6d { mix-blend-mode: var(--tweak); }</style>';
		expect(htmlToText(html)).toBe(
			'Join the Garden plants and critters for an evening of home-grown music \u2013\u2013 ' +
				'somewhere between a house show and barnyard jam.\n\n' +
				'Bring a blanket to sit on and snacks to share :)\n\n' +
				'produced by Lucy'
		);
	});

	it('turns <br> into a line break and two in a row into a blank line', () => {
		expect(htmlToText('<p><strong>Free screening</strong><br><strong>#MMIW</strong></p>')).toBe(
			'Free screening\n#MMIW'
		);
		expect(htmlToText('<p>One<br><br>Two</p>')).toBe('One\n\nTwo');
	});

	it('keeps line breaks a pre-wrap paragraph shows, and collapses ordinary source newlines', () => {
		expect(htmlToText('<p style="white-space: pre-wrap">Line one\nLine two</p>')).toBe(
			'Line one\nLine two'
		);
		expect(htmlToText('<p>Wrapped\n   in   the source</p>')).toBe('Wrapped in the source');
	});

	it('keeps link, button and caption text in order, word for word', () => {
		const html =
			'<p>RSVP <a href="https://example.com/rsvp?a=1&amp;b=2">on Eventbrite</a>.</p>' +
			'<div class="sqs-block-button"><a class="sqs-button-element">Donate</a></div>' +
			'<figure><img alt="ignored alt" src="x.jpg"><figcaption>Photo: Ana</figcaption></figure>';
		expect(htmlToText(html)).toBe('RSVP on Eventbrite.\n\nDonate\n\nPhoto: Ana');
	});

	it('keeps a list as one bulleted line per item, even when items wrap their text in <p>', () => {
		const html =
			'<p>What to bring:</p><ul data-rte-list="default">' +
			'<li><p style="white-space:pre-wrap;">Water</p></li>' +
			'<li><p style="white-space:pre-wrap;">A <strong>mat</strong></p></li>' +
			'<li><p></p></li></ul><p>See you there!</p>';
		expect(htmlToText(html)).toBe('What to bring:\n\n\u2022 Water\n\u2022 A mat\n\nSee you there!');
	});

	it('survives unclosed tags and a ">" inside an attribute', () => {
		expect(htmlToText('<p title="a > b">First<p>Second')).toBe('First\n\nSecond');
	});

	it('drops hidden fallbacks and embeds', () => {
		expect(
			htmlToText('<p>Shown</p><noscript><img src="x"><p>Fallback</p></noscript><iframe>x</iframe>')
		).toBe('Shown');
	});

	it('is empty for a page with no text', () => {
		expect(htmlToText('<div><p data-rte-preserve-empty="true"></p><img src="x"></div>')).toBe('');
	});
});

describe('parseEventPage + toRawEvent', () => {
	const page = {
		website: { timeZone: TZ, siteTitle: 'U Street Community' },
		collection: { title: 'Events' },
		item: {
			title: ' Fall Natives Planting Party ',
			startDate: ny('2026-10-03T10:00:00', '-04:00'),
			endDate: ny('2026-10-03T12:00:00', '-04:00'),
			location: {
				addressTitle: 'Temperance Alley Garden',
				addressLine1: '',
				addressLine2: '',
				mapLat: 38.9
			},
			body: '<p>Help us plant natives.</p><p>Led by Joe.</p>',
			excerpt: '<p>Plant natives with neighbors.</p>',
			tags: ['garden'],
			categories: [],
			author: { displayName: 'Site Admin' }
		}
	};

	it('reads the catalogue fields off a page', () => {
		const { item, timeZone } = parseEventPage(page);
		const url = 'https://www.ustreetcommunity.org/events/fall-natives-planting-party';
		expect(toRawEvent(url, item, timeZone)).toEqual({
			url,
			title: 'Fall Natives Planting Party',
			date: '2026-10-03',
			time: '10:00 AM - 12:00 PM',
			location: 'Temperance Alley Garden',
			description: 'Help us plant natives.\n\nLed by Joe.',
			bodyText: 'Help us plant natives.\n\nLed by Joe.',
			excerptText: 'Plant natives with neighbors.',
			tags: ['garden'],
			categories: []
		});
	});

	it('takes the description from the body, else the excerpt, else none', () => {
		const url = 'https://www.ustreetcommunity.org/events/x';
		const withoutBody = parseEventPage({ item: { ...page.item, body: '<div></div>' } });
		expect(toRawEvent(url, withoutBody.item, TZ).description).toBe('Plant natives with neighbors.');
		const empty = parseEventPage({ item: { ...page.item, body: null, excerpt: '' } });
		expect(toRawEvent(url, empty.item, TZ).description).toBeNull();
	});

	it('decodes the HTML escapes Squarespace serves titles with, and nothing more', () => {
		const titled = parseEventPage({
			item: { ...page.item, title: 'Canopy &amp; Candlelight: An Analog Sukkot Shabbat ' }
		});
		expect(toRawEvent('https://www.ustreetcommunity.org/events/x', titled.item, TZ).title).toBe(
			'Canopy & Candlelight: An Analog Sukkot Shabbat'
		);
	});

	it('keeps the title exactly as published, emoji and punctuation included', () => {
		const titled = parseEventPage({ item: { ...page.item, title: 'Music in the Garden 🎶' } });
		const raw = toRawEvent('https://www.ustreetcommunity.org/events/x', titled.item, TZ);
		expect(verbatimText(raw)).toEqual({
			title: 'Music in the Garden 🎶',
			description: 'Help us plant natives.\n\nLed by Joe.'
		});
	});

	it('dates a late-evening event by the site zone, not UTC', () => {
		// 11 PM in DC is already the next day in UTC.
		const late = {
			...page,
			item: { ...page.item, startDate: ny('2026-10-03T23:00:00', '-04:00') }
		};
		const { item, timeZone } = parseEventPage(late);
		expect(toRawEvent('https://www.ustreetcommunity.org/events/x', item, timeZone).date).toBe(
			'2026-10-03'
		);
	});

	it('defaults to the DC zone when the response names none', () => {
		expect(parseEventPage({ item: page.item }).timeZone).toBe(TZ);
	});

	it('rejects a response that is not an event item', () => {
		expect(() => parseEventPage({ collection: {}, items: [] })).toThrow();
		expect(() => parseEventPage({ item: { title: 'No date' } })).toThrow();
	});
});
