import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EventSource } from '../db/seed-core';
import {
	buildSystemPrompt,
	seriesCatalog,
	styleExamples,
	toEventSource,
	uncuratedEventSource
} from './curate-prompt';
import type { RawEvent } from './squarespace';
import { SEED_PATH, canonicalEvent, formatSeed } from './workspace';

const ev = (over: Partial<EventSource>): EventSource => ({
	title: 'Yoga in the Garden',
	date: '2026-07-28',
	time: '6:00 PM - 7:00 PM',
	location: null,
	description: 'All-levels yoga.',
	hosts: [],
	url: 'https://x/y',
	mayHaveException: false,
	...over
});

const raw: RawEvent = {
	url: 'https://www.ustreetcommunity.org/events/music',
	title: 'Music in the Garden ft. Lucy',
	date: '2026-09-04',
	time: '7:00 PM - 9:00 PM',
	location: null,
	description:
		'Live music \u2013\u2013 somewhere between a house show and barnyard jam.\n\nBring a blanket :)',
	bodyText:
		'Live music \u2013\u2013 somewhere between a house show and barnyard jam.\n\nBring a blanket :)',
	excerptText: '',
	tags: [],
	categories: []
};

describe('seriesCatalog', () => {
	it('keys banners by explicit series, else title, at five or more events', () => {
		const events = [
			...Array.from({ length: 5 }, (_, i) =>
				ev({ title: `Music ft. ${i}`, series: 'Music in the Garden', hosts: ['Lucy'] })
			),
			...Array.from({ length: 4 }, () => ev({ title: 'Gong Bath' }))
		];
		const catalog = seriesCatalog(events);
		expect(catalog.map((s) => s.name)).toEqual(['Music in the Garden']);
		expect(catalog[0].usualHosts).toEqual(['Lucy']);
		expect(catalog[0].otherTitles).toHaveLength(5);
	});
});

describe('the prompt built from the real seed', () => {
	const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8')).events as EventSource[];

	it('is deterministic, so it caches across a run', () => {
		expect(buildSystemPrompt(seed)).toBe(buildSystemPrompt([...seed]));
	});

	it("tells Claude the title and description are the page's, not its to write", () => {
		const prompt = buildSystemPrompt(seed);
		expect(prompt).toContain('exactly as the page wrote them');
		expect(prompt).not.toMatch(/in your own words/i);
		expect(prompt).not.toMatch(/^description:/m);
		// The examples show only the judged fields, never a description to imitate.
		for (const line of prompt.split('\n').filter((l) => l.startsWith('{"title"'))) {
			expect(JSON.parse(line)).not.toHaveProperty('description');
		}
	});

	it('names the recurring banners and shows varied examples', () => {
		const prompt = buildSystemPrompt(seed);
		expect(prompt).toContain('- Garden Volunteer Hours (');
		expect(prompt).toContain('- Music in the Garden (');
		const examples = styleExamples(seed);
		expect(examples.some((e) => e.series)).toBe(true);
		expect(examples.some((e) => e.mayHaveException)).toBe(true);
		expect(examples.some((e) => e.hosts.length > 0)).toBe(true);
	});
});

describe('toEventSource', () => {
	const known = new Set(['Music in the Garden']);

	it('takes the title and description word for word from the page, judged fields from Claude', () => {
		const { event, warnings } = toEventSource(
			raw,
			{
				hosts: ['Lucy', ' Lucy ', ''],
				series: 'Music in the Garden',
				mayHaveException: false,
				possibleExceptionDescription: 'stray note'
			},
			known
		);
		expect(warnings).toEqual([]);
		expect(event).toEqual({
			title: raw.title,
			series: 'Music in the Garden',
			date: raw.date,
			time: raw.time,
			location: null,
			description: raw.description,
			hosts: ['Lucy'],
			url: raw.url,
			mayHaveException: false
		});
	});

	it('drops an invented banner and keeps a flag note tidy', () => {
		const { event, warnings } = toEventSource(
			raw,
			{
				hosts: [],
				series: 'Garden Concerts',
				mayHaveException: true,
				possibleExceptionDescription: 'No host listed, unlike similar sessions.'
			},
			known
		);
		expect(event.series).toBeUndefined();
		expect(event.possibleExceptionDescription).toBe('No host listed, unlike similar sessions');
		expect(warnings).toEqual(['dropped unknown series "Garden Concerts"']);
	});
});

describe('uncuratedEventSource', () => {
	it('copies the page in full and flags the entry for review', () => {
		const long = { ...raw, description: 'A sentence that runs on. '.repeat(40).trim() };
		const event = uncuratedEventSource(long, new Set());
		expect(event.title).toBe(raw.title);
		expect(event.description).toBe(long.description);
		expect(event.hosts).toEqual([]);
		expect(event.mayHaveException).toBe(true);
	});
});

describe('formatSeed', () => {
	it('round-trips the seed file byte-for-byte', async () => {
		const original = readFileSync(SEED_PATH, 'utf-8');
		expect(await formatSeed(JSON.parse(original))).toBe(original);
	});

	it('appends new rows in the seed style, escaping non-ASCII', async () => {
		const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
		seed.events.push(canonicalEvent(ev({ title: 'Caf\u00e9 \u2013 Night', hosts: ['Zoe'] })));
		const out = await formatSeed(seed);
		expect(out).toContain('"title": "Caf\\u00e9 \\u2013 Night"');
		expect(out).toContain('"hosts": ["Zoe"]');
	});
});
