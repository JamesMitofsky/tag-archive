import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());
vi.mock('#lib/server/cache.ts', () => ({ purgeArchiveCache: vi.fn(async () => {}) }));

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { event, image, imageSet, user } = await import('#lib/server/db/schema.ts');
const { mintDraftToken, submissionPrefix } = await import('#lib/server/drafts.ts');
const { load, actions } = await import('./+page.server');
type Image = import('#lib/server/db/schema.ts').Image;

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };
const CONTRIBUTOR = { id: 'contributor-1', role: 'contributor', email: 'c@example.org' };
type Keeper = typeof ADMIN;

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ ...ADMIN, name: 'Admin' },
		{ ...CONTRIBUTOR, name: 'Contributor' }
	]);
	await db.insert(event).values({ id: 1, title: 'Vetted Concert', date: '2024-06-01' });
});

let uploads = 0;

/**
 * A finalized, unattached photograph, as /api/images/finalize records one: a
 * keeper's at the bucket root attributed to them, a draft's under its own
 * prefix and unattributed (see `ownsImage`).
 */
async function upload(
	by: { userId: string } | { prefix: string },
	capturedAt: string | null = null
): Promise<Image> {
	uploads++;
	const uuid = `00000000-0000-4000-8000-${String(uploads).padStart(12, '0')}`;
	const folder = `https://bucket.test/${'prefix' in by ? by.prefix : ''}images/${uuid}`;
	const createdBy = 'userId' in by ? by.userId : null;
	const [row] = await db
		.insert(image)
		.values({
			url: `${folder}/display.webp`,
			originalUrl: `${folder}/original.jpg`,
			originalType: 'image/jpeg',
			originalBytes: 1000,
			bytes: 500,
			width: 40,
			height: 30,
			capturedAt,
			createdBy,
			updatedBy: createdBy
		})
		.returning();
	return row;
}

async function caught(run: () => unknown) {
	try {
		return await run();
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

async function create(images: Pick<Image, 'id'>[], who: Keeper | null, extra = {}) {
	const body = new FormData();
	for (const row of images) body.append('imageIds', String(row.id));
	for (const [key, value] of Object.entries(extra)) body.append(key, String(value));
	const request = new Request('http://localhost/keeper/images/new', { method: 'POST', body });
	// The action types expect a full RequestEvent; these fields are all it reads.
	return caught(() =>
		actions.createImageSet({ request, locals: who ? { user: who } : {} } as never)
	);
}

/** The id from a `/keeper/images/{id}?created` redirect. */
function createdId(result: unknown): number {
	const match = (result as { location: string }).location.match(
		/^\/keeper\/images\/(\d+)\?created$/
	);
	expect(match).not.toBeNull();
	return Number(match![1]);
}

async function setRow(id: number) {
	const [row] = await db.select().from(imageSet).where(eq(imageSet.id, id));
	return row;
}

async function members(setId: number) {
	const rows = await db
		.select({ id: image.id, position: image.position })
		.from(image)
		.where(eq(image.setId, setId))
		.orderBy(asc(image.position));
	return rows.map((row) => [row.id, row.position]);
}

const countSets = async () => (await db.select({ id: imageSet.id }).from(imageSet)).length;

describe('/keeper/images/new load', () => {
	it('sends anyone without a session to sign in', async () => {
		const result = await caught(() => load({ locals: {} } as never));
		expect(isRedirect(result) && result.location).toBe('/keeper');
	});
});

describe('/keeper/images/new createImageSet', () => {
	it('refuses without a session', async () => {
		const result = await create([await upload({ userId: ADMIN.id })], null);
		expect(isActionFailure(result) && result.status).toBe(401);
	});

	it('wants at least one photograph, echoing what was typed', async () => {
		const result = await create([], ADMIN, { description: 'Planting day' });
		expect(isActionFailure(result) && result.status).toBe(400);
		expect(isActionFailure(result) && result.data).toMatchObject({
			values: { description: 'Planting day', imageIds: [] }
		});
	});

	it("lands an admin's set vetted, dated by its photographs, on its page", async () => {
		const first = await upload({ userId: ADMIN.id }, '2022-01-02T03:04:05');
		const second = await upload({ userId: ADMIN.id });
		// No `dateAuto` posted: a new set's date follows its photographs regardless.
		const id = createdId(await create([second, first], ADMIN, { event: 'Vetted Concert' }));
		expect(await setRow(id)).toMatchObject({
			proposedAddition: false,
			createdBy: ADMIN.id,
			eventId: 1,
			date: '2022-01-02'
		});
		expect(await members(id)).toEqual([
			[second.id, 0],
			[first.id, 1]
		]);
	});

	it("lands a contributor's set as a proposed addition, for an admin to vet", async () => {
		const id = createdId(await create([await upload({ userId: CONTRIBUTOR.id })], CONTRIBUTOR));
		expect(await setRow(id)).toMatchObject({
			proposedAddition: true,
			createdBy: CONTRIBUTOR.id
		});
	});

	it("refuses another keeper's or a draft's uploads", async () => {
		const draftPrefix = submissionPrefix(mintDraftToken().draft.id);
		for (const foreign of [
			await upload({ userId: CONTRIBUTOR.id }),
			await upload({ prefix: draftPrefix })
		]) {
			const before = await countSets();
			const result = await create([foreign], ADMIN);
			expect(isActionFailure(result) && result.status).toBe(400);
			expect(await countSets()).toBe(before);
		}
	});
});
