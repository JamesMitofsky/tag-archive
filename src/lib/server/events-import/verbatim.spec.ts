import { describe, expect, it } from 'vitest';
import type { EventSource } from '../db/seed-core';
import type { RawEvent } from './squarespace';
import { sameText, verbatimMismatches } from './verbatim';

const URL = 'https://www.ustreetcommunity.org/events/music-in-the-garden';
const raw: RawEvent = {
	url: URL,
	title: 'Music in the Garden 🎶',
	date: '2026-07-31',
	time: '7:00 PM - 9:00 PM',
	location: null,
	description: 'Join the Garden plants and critters for an evening of home-grown music.',
	bodyText: 'Join the Garden plants and critters for an evening of home-grown music.',
	excerptText: '',
	tags: [],
	categories: []
};
const entry = (over: Partial<EventSource> = {}): EventSource => ({
	title: raw.title,
	date: raw.date,
	time: raw.time,
	location: null,
	description: raw.description,
	hosts: [],
	url: URL,
	...over
});
const pages = new Map([[URL, raw]]);

describe('verbatimMismatches', () => {
	it("passes an entry that keeps its page's title and description", () => {
		expect(verbatimMismatches([entry()], pages)).toEqual([]);
	});

	it('refuses a paraphrased description', () => {
		const paraphrased = entry({
			description: 'An informal musical gathering centered on live performances in a garden.'
		});
		expect(verbatimMismatches([paraphrased], pages)).toEqual([
			expect.objectContaining({
				problem: 'description-differs',
				expected: raw.description,
				actual: paraphrased.description
			})
		]);
	});

	it('refuses a tidied title, even a one-character change', () => {
		expect(verbatimMismatches([entry({ title: 'Music in the Garden!' })], pages)).toEqual([
			expect.objectContaining({ problem: 'title-differs', expected: raw.title })
		]);
	});

	it('refuses an entry with no saved page to check against', () => {
		expect(verbatimMismatches([entry({ url: 'https://x/other' })], pages)).toEqual([
			expect.objectContaining({ problem: 'no-saved-page' })
		]);
		expect(verbatimMismatches([entry({ url: null })], pages)).toEqual([
			expect.objectContaining({ problem: 'no-saved-page' })
		]);
	});
});

describe('sameText', () => {
	it('ignores only what the archive normalizes: outer title whitespace, empty vs no description', () => {
		expect(sameText({ title: ' A ', description: '' }, { title: 'A', description: null })).toEqual({
			title: true,
			description: true
		});
		expect(sameText({ title: 'A', description: 'x ' }, { title: 'A', description: 'x' })).toEqual({
			title: true,
			description: false
		});
	});
});
