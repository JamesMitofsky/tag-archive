import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { applyImport, planImport, type ImportEvent } from './import-core';

const { event, eventHost, person, series } = schema;

// import-core takes its db as an argument, so each test builds its own fresh,
// fully migrated file DB — no $env mocking needed.
let db: ReturnType<typeof drizzle<typeof schema>>;
beforeEach(async () => {
	const dir = mkdtempSync(join(tmpdir(), 'tag-archive-events-import-'));
	db = drizzle(createClient({ url: `file:${join(dir, 'test.db')}` }), { schema });
	await migrate(db, { migrationsFolder: 'drizzle' });

	await db.insert(series).values({ id: 1, name: 'Yoga in the Garden' });
	await db.insert(person).values({ id: 1, name: 'Zoe' });
	await db.insert(event).values([
		{
			id: 1,
			title: 'Yoga in the Garden',
			seriesId: 1,
			date: '2026-07-28',
			url: 'https://x/yoga-1'
		},
		{ id: 2, title: 'Field Trip', date: '2026-05-12', url: null }
	]);
});

const entry = (over: Partial<ImportEvent> & Pick<ImportEvent, 'url'>): ImportEvent => ({
	title: 'Delete Day',
	date: '2026-09-20',
	time: '2:00 PM - 4:00 PM',
	location: null,
	description: 'A workshop.',
	hosts: [],
	mayHaveException: false,
	...over
});

const options = { today: '2026-10-12', includeUpcoming: false };

describe('planImport', () => {
	it('skips what the database or file already has, and upcoming events', async () => {
		const plan = await planImport(
			db,
			[
				entry({ url: 'https://x/new' }),
				entry({ url: 'https://x/yoga-1', title: 'Yoga in the Garden' }),
				entry({ url: 'https://x/field-trip', title: 'Field Trip', date: '2026-05-12' }),
				entry({ url: 'https://x/later', date: '2026-10-20' }),
				entry({ url: 'https://x/new' })
			],
			options
		);
		expect(plan.insert.map((e) => e.url)).toEqual(['https://x/new']);
		expect(plan.skipped.map((s) => [s.event.url, s.reason])).toEqual([
			['https://x/yoga-1', 'already-imported'],
			['https://x/field-trip', 'same-title-and-date'],
			['https://x/later', 'upcoming'],
			['https://x/new', 'repeated-in-file']
		]);
	});

	it('includes upcoming events on request', async () => {
		const plan = await planImport(db, [entry({ url: 'https://x/later', date: '2026-10-20' })], {
			...options,
			includeUpcoming: true
		});
		expect(plan.insert).toHaveLength(1);
	});

	it('resolves series the way the seed does, and lists what it must create', async () => {
		const plan = await planImport(
			db,
			[
				entry({ url: 'https://x/a', title: 'Yoga in the Garden' }),
				entry({ url: 'https://x/b', title: 'Sunset Yoga', series: 'Yoga in the Garden' }),
				entry({ url: 'https://x/c', title: 'Music!', series: 'Music in the Garden' }),
				entry({ url: 'https://x/d', title: 'Delete Day', hosts: ['Zoe', ' Shushan ', 'Shushan'] })
			],
			options
		);
		expect(Object.fromEntries(plan.seriesByUrl)).toEqual({
			'https://x/a': 'Yoga in the Garden',
			'https://x/b': 'Yoga in the Garden',
			'https://x/c': 'Music in the Garden',
			'https://x/d': null
		});
		expect(plan.newSeries).toEqual(['Music in the Garden']);
		expect(plan.newPeople).toEqual(['Shushan']);
	});
});

describe('applyImport', () => {
	const events = [
		entry({ url: 'https://x/a', title: 'Yoga in the Garden', hosts: ['Zoe'] }),
		entry({
			url: 'https://x/b',
			title: 'Music!',
			series: 'Music in the Garden',
			hosts: ['Lucy', 'Zoe'],
			mayHaveException: true,
			possibleExceptionDescription: 'Canceled due to rain'
		})
	];

	it('inserts events with their series and hosts, as proposed additions by default', async () => {
		const plan = await planImport(db, events, options);
		const summary = await applyImport(db, plan, { proposed: true, actorId: null });
		expect(summary).toEqual({ events: 2, series: 1, people: 1, hostLinks: 3 });

		const rows = await db.query.event.findMany({
			where: (e, { like }) => like(e.url, 'https://x/%'),
			with: { series: true, hosts: { with: { person: true } } },
			orderBy: (e) => e.id
		});
		const imported = rows.filter((r) => r.url === 'https://x/a' || r.url === 'https://x/b');
		expect(
			imported.map((r) => ({
				url: r.url,
				series: r.series?.name ?? null,
				hosts: r.hosts.map((h) => h.person.name).sort(),
				proposed: r.proposedAddition,
				note: r.possibleExceptionDescription
			}))
		).toEqual([
			{
				url: 'https://x/a',
				series: 'Yoga in the Garden',
				hosts: ['Zoe'],
				proposed: true,
				note: null
			},
			{
				url: 'https://x/b',
				series: 'Music in the Garden',
				hosts: ['Lucy', 'Zoe'],
				proposed: true,
				note: 'Canceled due to rain'
			}
		]);
		// The banner it had to create waits for review alongside its events.
		const [music] = await db.select().from(series).where(eq(series.name, 'Music in the Garden'));
		expect(music.proposedAddition).toBe(true);
	});

	it('publishes directly when not proposed', async () => {
		await applyImport(db, await planImport(db, events, options), {
			proposed: false,
			actorId: null
		});
		const rows = await db.select().from(event).where(eq(event.url, 'https://x/b'));
		expect(rows[0].proposedAddition).toBe(false);
	});

	it('is idempotent: a second run adds nothing', async () => {
		await applyImport(db, await planImport(db, events, options), { proposed: true, actorId: null });
		const again = await planImport(db, events, options);
		expect(again.insert).toHaveLength(0);
		expect(again.skipped.every((s) => s.reason === 'already-imported')).toBe(true);
		expect(await applyImport(db, again, { proposed: true, actorId: null })).toEqual({
			events: 0,
			series: 0,
			people: 0,
			hostLinks: 0
		});
		expect(await db.select().from(event)).toHaveLength(4);
	});

	it('writes all or nothing', async () => {
		const plan = await planImport(db, events, options);
		// Sabotage the last statement: a host link whose person can't resolve
		// violates event_host's NOT NULL person_id.
		plan.newPeople = [];
		await expect(applyImport(db, plan, { proposed: true, actorId: null })).rejects.toThrow();
		expect(await db.select().from(event)).toHaveLength(2);
		expect(await db.select().from(series)).toHaveLength(1);
		expect(await db.select().from(eventHost)).toHaveLength(0);
	});
});
