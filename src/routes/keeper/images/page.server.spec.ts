import { isHttpError, isRedirect } from '@sveltejs/kit';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
// Not under test here; keep the metadata parser out of the import graph.
vi.mock('$lib/server/imageMetadata', () => ({ parseImageMetadata: vi.fn() }));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { event, image, imageSet, user } = await import('$lib/server/db/schema');
const list = await import('./+page.server');
const detail = await import('./[id]/+page.server');
const add = await import('./add/+page.server');

const KEEPER = { id: 'keeper-1', role: 'contributor', email: 'keeper@example.org' };
const GPS = { gps: { latitude: 38.9, longitude: -77 } };

let concertId: number;
let emptyId: number;

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values({ ...KEEPER, name: 'Keeper' });
	await db.insert(event).values({ id: 1, title: 'Vetted Concert', date: '2024-06-01' });

	[{ id: concertId }] = await db
		.insert(imageSet)
		.values({ description: 'Front row', eventId: 1, date: '2024-06-01', proposedAddition: true })
		.returning({ id: imageSet.id });
	[{ id: emptyId }] = await db
		.insert(imageSet)
		.values({ date: null })
		.returning({ id: imageSet.id });

	for (const position of [1, 0]) {
		const folder = `https://bucket.test/images/00000000-0000-4000-8000-00000000000${position}`;
		await db.insert(image).values({
			setId: concertId,
			position,
			url: `${folder}/display.webp`,
			originalUrl: `${folder}/original.heic`,
			originalType: 'image/heic',
			originalName: `IMG_000${position}.HEIC`,
			originalBytes: 3_000_000,
			bytes: 400_000,
			width: 2560 - position,
			height: 1920,
			capturedAt: `2024-06-01T20:0${position}:00`,
			capturedOffset: '-04:00',
			metadata: GPS,
			createdBy: KEEPER.id
		});
	}
});

/** Run a load, handing back the redirect or error it throws. */
async function run<T>(load: (event: never) => T, event: object): Promise<Awaited<T> | unknown> {
	try {
		return await load(event as never);
	} catch (thrown) {
		if (isRedirect(thrown) || isHttpError(thrown)) return thrown;
		throw thrown;
	}
}

describe('/keeper/images', () => {
	it('is for signed-in keepers only', async () => {
		const result = await run(list.load, { locals: {} });
		expect(isRedirect(result) && result.location).toBe('/keeper');
	});

	it('sends each row only what it shows: no metadata, no originals', async () => {
		const data = (await run(list.load, { locals: { user: KEEPER } })) as {
			sets: Record<string, unknown>[];
		};
		// Newest first, undated last.
		expect(data.sets).toEqual([
			{
				id: concertId,
				description: 'Front row',
				event: 'Vetted Concert',
				date: '2024-06-01',
				proposedAddition: true,
				count: 2,
				// The first photograph in display order.
				cover: {
					url: 'https://bucket.test/images/00000000-0000-4000-8000-000000000000/display.webp',
					width: 2560,
					height: 1920
				}
			},
			{
				id: emptyId,
				description: null,
				event: null,
				date: null,
				proposedAddition: false,
				count: 0,
				cover: null
			}
		]);
		expect(JSON.stringify(data)).not.toMatch(/latitude|original|IMG_/);
	});
});

describe('/keeper/images/[id]', () => {
	it('is for signed-in keepers only', async () => {
		const result = await run(detail.load, { params: { id: String(concertId) }, locals: {} });
		expect(isRedirect(result) && result.location).toBe('/keeper');
	});

	it('404s an unknown or malformed id', async () => {
		for (const id of ['999999', 'abc', '-1']) {
			const result = await run(detail.load, { params: { id }, locals: { user: KEEPER } });
			expect(isHttpError(result) && result.status).toBe(404);
		}
	});

	it("reads one set's photographs in order, originals and metadata included", async () => {
		const data = (await run(detail.load, {
			params: { id: String(concertId) },
			locals: { user: KEEPER }
		})) as { set: { images: Record<string, unknown>[] } };
		expect(data.set).toMatchObject({ id: concertId, event: 'Vetted Concert', dateAuto: true });
		expect(data.set.images.map((row) => row.originalName)).toEqual([
			'IMG_0000.HEIC',
			'IMG_0001.HEIC'
		]);
		expect(data.set.images[0]).toMatchObject({
			originalUrl: 'https://bucket.test/images/00000000-0000-4000-8000-000000000000/original.heic',
			originalType: 'image/heic',
			originalBytes: 3_000_000,
			capturedAt: '2024-06-01T20:00:00',
			capturedOffset: '-04:00',
			metadata: GPS
		});
		// Audit columns are not the page's business.
		expect(data.set.images[0]).not.toHaveProperty('createdBy');
	});
});

describe('/keeper/images/add', () => {
	it('sends keepers to the shared photograph form for good', async () => {
		const result = await run(add.load, {});
		expect(isRedirect(result) && result).toMatchObject({
			status: 308,
			location: '/contribute/images'
		});
	});
});
