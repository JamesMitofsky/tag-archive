import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());
// Record storage deletes and cache purges instead of calling R2 and Vercel.
const deleteScan = vi.hoisted(() => vi.fn(async (_key: string) => {}));
vi.mock('#lib/server/scans.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/scans.ts')>()),
	deleteScan
}));
vi.mock('#lib/server/cache.ts', () => ({ purgeArchiveCache: vi.fn(async () => {}) }));
// Not under test here; keep the metadata parser out of the import graph.
vi.mock('#lib/server/imageMetadata.ts', () => ({ parseImageMetadata: vi.fn() }));

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { image, imageSet, user } = await import('#lib/server/db/schema.ts');
const { actions, load } = await import('./+page.server');

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };
const KEEPER = { id: 'keeper-1', role: 'contributor', email: 'keeper@example.org' };
type Caller = typeof ADMIN | typeof KEEPER | null;

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ ...ADMIN, name: 'Admin' },
		{ ...KEEPER, name: 'Keeper' }
	]);
});
beforeEach(() => deleteScan.mockClear());

let uploads = 0;

/** A proposed set of `count` photographs, from the public or a keeper. */
async function proposed(count: number, from: 'public' | 'keeper') {
	const createdBy = from === 'keeper' ? KEEPER.id : null;
	const [{ id }] = await db
		.insert(imageSet)
		.values({ description: 'Submitted', proposedAddition: true, createdBy })
		.returning({ id: imageSet.id });
	for (let position = 0; position < count; position++) {
		uploads++;
		const folder = `https://bucket.test/submissions/d/images/00000000-0000-4000-8000-${String(uploads).padStart(12, '0')}`;
		await db.insert(image).values({
			setId: id,
			position,
			url: `${folder}/display.webp`,
			originalUrl: `${folder}/original.jpg`,
			originalType: 'image/jpeg',
			originalBytes: 1000,
			bytes: 500,
			width: 40,
			height: 30,
			metadata: { gps: { latitude: 38.9, longitude: -77 } },
			createdBy
		});
	}
	return id;
}

async function act(name: keyof typeof actions, id: number | string, caller: Caller = ADMIN) {
	const body = new FormData();
	body.append('id', String(id));
	const event = {
		request: new Request('http://localhost/keeper/settings/review/images', {
			method: 'POST',
			body
		}),
		locals: caller ? { user: caller } : {}
	};
	return actions[name](event as never);
}

const setRow = (id: number) => db.select().from(imageSet).where(eq(imageSet.id, id)).get();

describe('load', () => {
	it('is for admins only', async () => {
		for (const [caller, location] of [
			[null, '/keeper'],
			[KEEPER, '/keeper/settings']
		] as const) {
			const thrown = await Promise.resolve(
				load({ locals: caller ? { user: caller } : {} } as never)
			).catch((e: unknown) => e);
			expect(isRedirect(thrown) && thrown.location).toBe(location);
		}
	});

	it('sends each card a few thumbnails and who sent it, never metadata or originals', async () => {
		const fromPublic = await proposed(10, 'public');
		const fromKeeper = await proposed(1, 'keeper');
		const data = (await load({ locals: { user: ADMIN } } as never)) as {
			sets: Record<string, unknown>[];
		};
		const cards = new Map(data.sets.map((card) => [card.id, card]));

		expect(cards.get(fromPublic)).toMatchObject({
			description: 'Submitted',
			count: 10,
			fromKeeper: false
		});
		expect(cards.get(fromPublic)?.thumbnails).toHaveLength(8);
		expect(cards.get(fromKeeper)).toMatchObject({
			count: 1,
			fromKeeper: true
		});
		expect(JSON.stringify(data.sets)).not.toMatch(/latitude|original|keeper-1|contact/i);
	});
});

describe('actions', () => {
	it('refuses anyone but an admin', async () => {
		const id = await proposed(1, 'public');
		for (const name of ['approve', 'reject'] as const) {
			const signedOut = await act(name, id, null);
			expect(isActionFailure(signedOut) && signedOut.status).toBe(401);
			const keeper = await act(name, id, KEEPER);
			expect(isActionFailure(keeper) && keeper.status).toBe(403);
		}
		expect(await setRow(id)).toMatchObject({ proposedAddition: true });
	});

	it('refuses a malformed id', async () => {
		const result = await act('approve', 'abc');
		expect(isActionFailure(result) && result.status).toBe(400);
	});

	it('approving vets the set, photographs and all', async () => {
		const id = await proposed(2, 'public');
		expect(await act('approve', id)).toEqual({ approved: true });
		expect(await setRow(id)).toMatchObject({ proposedAddition: false, updatedBy: ADMIN.id });
		expect(await db.select().from(image).where(eq(image.setId, id))).toHaveLength(2);
	});

	it('rejecting deletes the set with its photographs and stored objects', async () => {
		const id = await proposed(2, 'public');
		expect(await act('reject', id)).toEqual({ rejected: true });
		expect(await setRow(id)).toBeUndefined();
		expect(await db.select().from(image).where(eq(image.setId, id))).toHaveLength(0);
		// Two objects per photograph: the display copy and the original.
		expect(deleteScan).toHaveBeenCalledTimes(4);
	});
});
