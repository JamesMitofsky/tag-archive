import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { artefact, event, eventFeatureImage } = await import('$lib/server/db/schema');
const { load } = await import('./+page.server');

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };
const VETTED_PAGE = 'https://bucket.test/submissions/vetted.webp';
const PENDING_PAGE = 'https://bucket.test/submissions/pending.webp';

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(event).values([
		{ id: 1, title: 'Vetted page', date: '2024-06-01', proposedAddition: true },
		{ id: 2, title: 'Pending page', date: '2024-06-02', proposedAddition: true },
		{ id: 3, title: 'No image', date: '2024-06-03', proposedAddition: true }
	]);
	await db.insert(artefact).values([
		{ id: 1, artefact: 'Vetted flyer', date: '2024', fileUrls: [VETTED_PAGE] },
		{
			id: 2,
			artefact: 'Pending flyer',
			date: '2024',
			fileUrls: [PENDING_PAGE],
			proposedAddition: true
		}
	]);
	await db.insert(eventFeatureImage).values([
		{ eventId: 1, artefactId: 1, artefactFileUrl: VETTED_PAGE },
		{ eventId: 2, artefactId: 2, artefactFileUrl: PENDING_PAGE }
	]);
});

describe('review events load', () => {
	it("shows each proposed event's feature image, flagging a source still under review", async () => {
		// The load reads only `locals` of the RequestEvent.
		const data = (await load({ locals: { user: ADMIN } } as never)) as {
			events: { id: number; featureImage: { url: string; source: { proposed: boolean } } | null }[];
		};
		const byId = new Map(data.events.map((e) => [e.id, e.featureImage]));

		expect(byId.get(1)).toMatchObject({ url: VETTED_PAGE, source: { proposed: false } });
		expect(byId.get(2)).toMatchObject({ url: PENDING_PAGE, source: { proposed: true } });
		expect(byId.get(3)).toBeNull();
	});
});
