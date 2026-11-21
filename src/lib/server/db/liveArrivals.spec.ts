import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./testing');
	useTestDatabaseUrl();
});
// SvelteKit fills $app/env/private when the Vite config loads, before this file sets
// the variables, so the spec hands the module the live process.env instead.
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());

const { db } = await import('./index');
const { migrateTestDatabase } = await import('./testing');
const { approveProposed, loadLiveArrivals } = await import('./queries');
const { artefact, artefactProvenance, event, person } = await import('./schema');
const { user } = await import('./auth.schema');

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 20, 12, minutes));

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values({ id: 'admin', name: 'Admin', email: 'admin@test' });
	await db.insert(event).values({ id: 1, title: 'Harvest Fair', date: '2026-10-01' });
	await db.insert(person).values({ id: 1, name: 'Ada' });
	await db.insert(artefact).values([
		// Made already vetted, in this order.
		{ id: 1, artefact: 'Oldest flyer', createdAt: at(0) },
		{ id: 2, artefact: 'Fair program', eventId: 1, date: '2026-10', createdAt: at(10) },
		// Submitted before both of the above went public, still awaiting review.
		{ id: 3, artefact: 'Pending zine', createdAt: at(-60), proposedAddition: true },
		{ id: 4, artefact: 'Waiting poster', createdAt: at(-30), proposedAddition: true },
		{ id: 5, artefact: 'Location test', location: 'Binder', createdAt: at(5) }
	]);
	await db.insert(artefactProvenance).values({ artefactId: 2, personId: 1 });
});

describe('loadLiveArrivals', () => {
	it('lists vetted artefacts newest first, leaving out submissions awaiting review', async () => {
		const feed = await loadLiveArrivals(10);
		expect(feed.map((a) => a.id)).toEqual([2, 5, 1]);
	});

	it('carries what the page draws, and nothing else', async () => {
		const [fair] = await loadLiveArrivals(1);
		expect(fair).toEqual({
			id: 2,
			artefact: 'Fair program',
			event: 'Harvest Fair',
			date: '2026-10',
			description: null,
			programArea: [],
			fileUrls: [],
			provenance: ['Ada'],
			arrivedAt: at(10).getTime()
		});
	});

	it('keeps to the limit', async () => {
		expect(await loadLiveArrivals(2)).toHaveLength(2);
	});

	it('counts an approved submission as arriving when approved, not when submitted', async () => {
		const before = Date.now();
		await approveProposed('artefact', 4, 'admin');

		const [row] = await db.select().from(artefact).where(eq(artefact.id, 4));
		expect(row.proposedAddition).toBe(false);
		expect(row.approvedAt!.getTime()).toBeGreaterThanOrEqual(before);

		const feed = await loadLiveArrivals(10);
		expect(feed.map((a) => a.id)).toEqual([4, 2, 5, 1]);
		expect(feed[0].arrivedAt).toBe(row.approvedAt!.getTime());
	});

	it('keeps the first approval moment if the approval is repeated', async () => {
		const [first] = await db.select().from(artefact).where(eq(artefact.id, 4));
		await new Promise((resolve) => setTimeout(resolve, 5));
		await approveProposed('artefact', 4, 'admin');
		const [again] = await db.select().from(artefact).where(eq(artefact.id, 4));
		expect(again.approvedAt).toEqual(first.approvedAt);
	});
});
