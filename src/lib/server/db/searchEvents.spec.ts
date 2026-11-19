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
const { searchEvents } = await import('./queries');
const { artefact, event, eventFeatureImage, image, imageSet } = await import('./schema');

const PAGE = 'https://bucket.test/submissions/flyer.webp';

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(event).values([
		{ id: 1, title: 'With a photograph', date: '2024-06-03' },
		{ id: 2, title: 'With a pending page', date: '2024-06-02' },
		{ id: 3, title: 'Without an image', date: '2024-06-01' }
	]);
	await db.insert(imageSet).values({ id: 1, description: 'Set' });
	await db.insert(image).values({
		id: 1,
		setId: 1,
		url: 'https://bucket.test/images/1/display.webp',
		originalUrl: 'https://bucket.test/images/1/original.heic',
		originalType: 'image/heic',
		originalBytes: 100,
		bytes: 50,
		width: 2560,
		height: 1920
	});
	await db
		.insert(artefact)
		.values({ id: 1, artefact: 'Flyer', date: '2024', fileUrls: [PAGE], proposedAddition: true });
	await db.insert(eventFeatureImage).values([
		{ eventId: 1, imageId: 1 },
		{ eventId: 2, artefactId: 1, artefactFileUrl: PAGE }
	]);
});

describe('searchEvents', () => {
	it("carries each row's feature image for the list's thumbnail, and only what renders it", async () => {
		const { rows, total } = await searchEvents({ q: '', offset: 0, limit: 10 });
		expect(total).toBe(3);
		expect(rows.map((row) => [row.id, row.featureImage])).toEqual([
			[1, { url: 'https://bucket.test/images/1/display.webp', width: 2560, height: 1920 }],
			// A keeper page: a source still under review shows here.
			[2, { url: PAGE, width: null, height: null }],
			[3, null]
		]);
	});

	it('resolves images for the requested page only', async () => {
		const { rows } = await searchEvents({ q: '', offset: 1, limit: 1 });
		expect(rows.map((row) => [row.id, row.featureImage?.url ?? null])).toEqual([[2, PAGE]]);
	});

	it('handles a page with no rows', async () => {
		expect(await searchEvents({ q: 'no such event', offset: 0, limit: 10 })).toEqual({
			rows: [],
			total: 0
		});
	});
});
