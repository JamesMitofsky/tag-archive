import { describe, expect, it } from 'vitest';
import {
	artefactEventIndexes,
	seriesBanners,
	type ArtefactSource,
	type EventSource,
	type SeedData
} from '../db/seed-core';
import { planDbRestore, planSeedRestore, type DbEventRow } from './restore-core';
import type { RawEvent } from './squarespace';
import type { VerbatimText } from './verbatim';

const url = (slug: string) => `https://www.ustreetcommunity.org/events/${slug}`;

const ev = (slug: string, over: Partial<EventSource> = {}): EventSource => ({
	title: 'Yoga in the Garden',
	date: '2026-07-01',
	time: '6:00 PM - 7:00 PM',
	location: null,
	description: 'All-levels yoga, summarized.',
	hosts: [],
	url: url(slug),
	...over
});

const page = (slug: string, title: string, description: string | null): [string, RawEvent] => [
	url(slug),
	{
		url: url(slug),
		title,
		date: '2026-07-01',
		time: '6:00 PM - 7:00 PM',
		location: null,
		description,
		bodyText: description ?? '',
		excerptText: '',
		tags: [],
		categories: []
	}
];

const artefact = (id: number, event: string | null, date = '2026-07-01'): ArtefactSource => ({
	id,
	artefact: `Artefact ${id}`,
	event,
	date,
	provenance: [],
	programArea: [],
	description: null,
	fileUrls: [],
	location: null
});

describe('planSeedRestore', () => {
	it("puts back the page's own title and description, word for word", () => {
		const seed: SeedData = { events: [ev('a', { title: 'Yoga!' })], artefacts: [] };
		const pages = new Map([page('a', 'Yoga in the Garden 🧘', 'All levels flow in the garden.')]);
		const plan = planSeedRestore(seed, pages, new Map());
		expect(plan.data.events[0]).toMatchObject({
			title: 'Yoga in the Garden 🧘',
			description: 'All levels flow in the garden.'
		});
		expect(plan.changes).toHaveLength(1);
		// The input is left as it was.
		expect(seed.events[0].title).toBe('Yoga!');
	});

	it('leaves events without a saved page or URL as they are, and counts verbatim ones', () => {
		const seed: SeedData = {
			events: [ev('gone'), ev('none', { url: null }), ev('same', { description: 'Exact.' })],
			artefacts: []
		};
		const plan = planSeedRestore(
			seed,
			new Map([page('same', 'Yoga in the Garden', 'Exact.')]),
			new Map()
		);
		expect(plan.changes).toEqual([]);
		expect(plan.noPage.map((e) => e.url)).toEqual([url('gone')]);
		expect(plan.noUrl).toBe(1);
		expect(plan.alreadyVerbatim).toBe(1);
		expect(plan.data).toEqual(seed);
	});

	it('does not trust a page now dated differently: it may be another event', () => {
		// The site reused a 2023 event's URL for a 2026 one.
		const seed: SeedData = {
			events: [ev('reused', { title: 'Tarot and Tea in the Garden', date: '2023-10-25' })],
			artefacts: []
		};
		const pages = new Map([
			page('reused', 'TRANSPLANT DAY 🌱', 'Welcoming our spring plant bebes!')
		]);
		const plan = planSeedRestore(seed, pages, new Map());
		expect(plan.changes).toEqual([]);
		expect(plan.data).toEqual(seed);
		expect(plan.pageMoved).toEqual([
			{
				url: url('reused'),
				archived: { date: '2023-10-25', title: 'Tarot and Tea in the Garden' },
				page: { date: '2026-07-01', title: 'TRANSPLANT DAY 🌱' },
				sameDatePages: []
			}
		]);
	});

	it('clears the AI-written summary of events with no usable page, keeping their title', () => {
		const seed: SeedData = {
			events: [
				ev('gone', { title: 'Seed Swap!', description: 'Summarized.' }),
				ev('moved', { date: '2023-10-25', description: 'Also summarized.' }),
				ev('edited', { description: 'Written later by a person.' }),
				ev('none', { url: null, description: 'No URL.' })
			],
			artefacts: []
		};
		const baseline = new Map([
			[url('gone'), { title: 'Seed Swap!', description: 'Summarized.' }],
			[url('moved'), { title: 'Yoga in the Garden', description: 'Also summarized.' }],
			[url('edited'), { title: 'Yoga in the Garden', description: 'Summarized.' }]
		]);
		const plan = planSeedRestore(
			seed,
			new Map([page('moved', 'TRANSPLANT DAY', 'Plants.')]),
			baseline
		);
		expect(plan.data.events.map((e) => [e.title, e.description])).toEqual([
			['Seed Swap!', null],
			['Yoga in the Garden', null],
			['Yoga in the Garden', 'Written later by a person.'],
			['Yoga in the Garden', 'No URL.']
		]);
		expect(plan.changes.map((c) => c.kind)).toEqual(['cleared', 'cleared']);
	});

	it('keeps a retitled event in its series banner', () => {
		// Five events grouped by the title "Yoga in the Garden"; one page now says otherwise.
		const seed: SeedData = {
			events: ['a', 'b', 'c', 'd', 'e'].map((s) => ev(s)),
			artefacts: []
		};
		const plan = planSeedRestore(seed, new Map([page('a', 'Garden Yoga 🌿', 'Flow.')]), new Map());
		expect(seriesBanners(plan.data.events)).toEqual(seriesBanners(seed.events));
		expect(plan.data.events[0]).toMatchObject({
			title: 'Garden Yoga 🌿',
			series: 'Yoga in the Garden'
		});
		expect(plan.pinnedSeries).toHaveLength(1);
	});

	it('does not let retitled one-offs form a banner by accident', () => {
		const seed: SeedData = {
			events: [
				...['a', 'b', 'c', 'd'].map((s) => ev(s, { title: 'Open Mic' })),
				ev('e', { title: 'Poetry Night' })
			],
			artefacts: []
		};
		const plan = planSeedRestore(seed, new Map([page('e', 'Open Mic', 'Poems.')]), new Map());
		expect(seriesBanners(plan.data.events)).toEqual([null, null, null, null, null]);
		expect(plan.data.events[4]).toMatchObject({ title: 'Open Mic', series: 'Poetry Night' });
	});

	it('leaves an explicit series alone', () => {
		const seed: SeedData = {
			events: ['a', 'b', 'c', 'd', 'e'].map((s) => ev(s, { series: 'Yoga' })),
			artefacts: []
		};
		const plan = planSeedRestore(seed, new Map([page('a', 'Sunset Yoga', 'Flow.')]), new Map());
		expect(plan.pinnedSeries).toEqual([]);
		expect(seriesBanners(plan.data.events)).toEqual(seriesBanners(seed.events));
	});

	it("points artefacts at their event's restored title, so links hold", () => {
		const seed: SeedData = {
			events: [
				ev('a', { title: 'Seed Swap!' }),
				ev('b', { title: 'Delete Day', date: '2026-08-01' })
			],
			artefacts: [
				artefact(1, 'Seed Swap!'),
				artefact(2, 'Delete Day', '2026-08-01'),
				artefact(3, null)
			]
		};
		const plan = planSeedRestore(
			seed,
			new Map([page('a', 'Seed Swap 🌱', 'Bring seeds.')]),
			new Map()
		);
		expect(artefactEventIndexes(plan.data.events, plan.data.artefacts)).toEqual(
			artefactEventIndexes(seed.events, seed.artefacts)
		);
		expect(plan.data.artefacts[0].event).toBe('Seed Swap 🌱');
		expect(plan.relinkedArtefacts).toEqual([{ id: 1, from: 'Seed Swap!', to: 'Seed Swap 🌱' }]);
	});
});

describe('planDbRestore', () => {
	const row = (over: Partial<DbEventRow> = {}): DbEventRow => ({
		id: 7,
		url: url('a'),
		date: '2026-07-01',
		title: 'Yoga!',
		description: 'Summarized.',
		...over
	});
	const baseline = new Map<string, VerbatimText>([
		[url('a'), { title: 'Yoga!', description: 'Summarized.' }]
	]);
	const pages = new Map([page('a', 'Yoga in the Garden', 'All levels flow in the garden.')]);

	it('restores a row that still holds what the import wrote', () => {
		const plan = planDbRestore([row()], baseline, pages);
		expect(plan.update).toEqual([
			{
				id: 7,
				url: url('a'),
				date: '2026-07-01',
				before: { title: 'Yoga!', description: 'Summarized.' },
				after: { title: 'Yoga in the Garden', description: 'All levels flow in the garden.' },
				kind: 'restored'
			}
		]);
		expect(plan.keeperEdited).toEqual([]);
	});

	it("never overwrites a keeper's edit, but still restores the untouched field", () => {
		const plan = planDbRestore([row({ title: 'Yoga (rain date)' })], baseline, pages);
		expect(plan.update[0].after).toEqual({
			title: 'Yoga (rain date)',
			description: 'All levels flow in the garden.'
		});
		expect(plan.keeperEdited).toEqual([
			expect.objectContaining({
				field: 'title',
				current: 'Yoga (rain date)',
				page: 'Yoga in the Garden'
			})
		]);
	});

	it('skips a row with both fields edited', () => {
		const plan = planDbRestore(
			[row({ title: 'Yoga (moved)', description: 'Keeper note.' })],
			baseline,
			pages
		);
		expect(plan.update).toEqual([]);
		expect(plan.keeperEdited).toHaveLength(2);
	});

	it('copies nothing from a page dated differently, and clears the imported summary', () => {
		const plan = planDbRestore([row({ date: '2023-10-25' })], baseline, pages);
		expect(plan.pageMoved).toHaveLength(1);
		expect(plan.update).toEqual([
			expect.objectContaining({
				id: 7,
				before: { title: 'Yoga!', description: 'Summarized.' },
				after: { title: 'Yoga!', description: null },
				kind: 'cleared'
			})
		]);
	});

	it("clears the imported summary of a row whose page is gone, but never a keeper's text", () => {
		const plan = planDbRestore(
			[row({ id: 1 }), row({ id: 2, description: 'Written by a keeper.' })],
			baseline,
			new Map()
		);
		expect(plan.update.map((u) => [u.id, u.kind, u.after.description])).toEqual([
			[1, 'cleared', null]
		]);
	});

	it('leaves rows it cannot judge: no baseline, no page, no URL, already verbatim', () => {
		const plan = planDbRestore(
			[
				row({ id: 1, url: url('new') }),
				row({ id: 2, url: url('gone') }),
				row({ id: 3, url: null }),
				row({ id: 4, title: 'Yoga in the Garden', description: 'All levels flow in the garden.' })
			],
			new Map([...baseline, [url('gone'), { title: 'x', description: null }]]),
			new Map([...pages, page('new', 'New', 'New.')])
		);
		expect(plan.update).toEqual([]);
		expect(plan.noBaseline.map((r) => r.id)).toEqual([1]);
		expect(plan.noPage.map((r) => r.id)).toEqual([2]);
		expect(plan.noUrl).toBe(1);
		expect(plan.alreadyVerbatim).toBe(1);
	});
});
