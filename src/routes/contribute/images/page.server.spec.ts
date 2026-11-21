import { isActionFailure, isRedirect, type Cookies } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());
// A rejected set's photographs are deleted from storage: record that instead of calling R2.
const deleteScan = vi.hoisted(() => vi.fn(async (_key: string) => {}));
vi.mock('#lib/server/scans.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/scans.ts')>()),
	deleteScan
}));
vi.mock('#lib/server/cache.ts', () => ({ purgeArchiveCache: vi.fn(async () => {}) }));

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { event, image, imageSet, user } = await import('#lib/server/db/schema.ts');
const { DRAFT_COOKIE, mintDraftToken, submissionPrefix } = await import('#lib/server/drafts.ts');
const { consume, LIMITS } = await import('#lib/server/rateLimit.ts');
const { actions } = await import('./+page.server');
type Image = import('#lib/server/db/schema.ts').Image;

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };
const CONTRIBUTOR = { id: 'keeper-1', role: 'contributor', email: 'keeper@example.org' };

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ ...ADMIN, name: 'Admin' },
		{ ...CONTRIBUTOR, name: 'Keeper' }
	]);
	await db.insert(event).values([
		{ id: 1, title: 'Vetted Concert', date: '2024-06-01' },
		{ id: 2, title: 'Pending Picnic', date: '2024-07-01', proposedAddition: true }
	]);
});

function cookieJar(token?: string): Cookies {
	const store = new Map<string, string>(token ? [[DRAFT_COOKIE, token]] : []);
	return {
		get: (name: string) => store.get(name),
		set: (name: string, value: string) => void store.set(name, value)
	} as unknown as Cookies;
}

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

/** A fresh anonymous draft session: its cookies, and a way to upload into its space. */
function anonymousDraft() {
	const { token, draft } = mintDraftToken();
	const prefix = submissionPrefix(draft.id);
	return {
		cookies: cookieJar(token),
		upload: (capturedAt: string | null = null) => upload({ prefix }, capturedAt)
	};
}

type ActionName = keyof typeof actions;
/** An open access pass, as hooks.server.ts leaves it on `locals` (#lib/access/pass). */
const OPEN_PASS = { kind: 't' as const, issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER };

async function run(
	name: ActionName,
	fields: Record<string, string | string[]>,
	{
		cookies = cookieJar(),
		as = null as typeof ADMIN | null,
		pass = OPEN_PASS as typeof OPEN_PASS | null,
		ip = '198.51.100.7'
	} = {}
) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		for (const v of Array.isArray(value) ? value : [value]) body.append(key, v);
	}
	const event = {
		request: new Request('http://localhost/contribute/images', { method: 'POST', body }),
		locals: { ...(as ? { user: as } : {}), ...(pass ? { pass } : {}) },
		cookies,
		getClientAddress: () => ip
	};
	try {
		// The action types expect a full RequestEvent; these fields are all it reads.
		return await actions[name](event as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

/** The create form as the page posts it: the ids in order, and the hidden `dateAuto`. */
const fields = (images: Pick<Image, 'id'>[], extra: Record<string, string> = {}) => ({
	imageIds: images.map((row) => String(row.id)),
	dateAuto: 'on',
	...extra
});

type Submitted = { id: number };
const submittedOf = (result: unknown) => (result as { submitted: Submitted }).submitted;

async function setRow(id: number) {
	return db.select().from(imageSet).where(eq(imageSet.id, id)).get();
}

/** A set's photographs as [id, position], in display order. */
async function members(setId: number) {
	const rows = await db
		.select({ id: image.id, position: image.position })
		.from(image)
		.where(eq(image.setId, setId))
		.orderBy(asc(image.position));
	return rows.map((row) => [row.id, row.position]);
}

const countSets = async () => (await db.select({ id: imageSet.id }).from(imageSet)).length;

/** Exhaust a per-IP limit for `ip`, as that many earlier requests would have. */
async function exhaust(bucket: string, ip: string, limit: { limit: number; windowMs: number }) {
	for (let i = 0; i < limit.limit; i++) await consume(bucket, ip, limit);
}

describe('createImageSet (anonymous)', () => {
	it('refuses without a draft session, as a lapsed tap', async () => {
		const { upload: add } = anonymousDraft();
		const photo = await add();
		const before = await countSets();
		const result = await run('createImageSet', fields([photo]));
		expect(isActionFailure(result) && result.status).toBe(401);
		// Marked as a lapsed tap, not a validation failure.
		expect(isActionFailure(result) && result.data).toMatchObject({ locked: true });
		expect(await countSets()).toBe(before);
	});

	it('refuses with a draft but no open pass: the archive has drifted shut', async () => {
		// The gate lets the enhanced post through so the form survives; the action
		// must still turn it away once the pass has run out (see #lib/access/gate).
		const { cookies, upload: add } = anonymousDraft();
		const photo = await add();
		const before = await countSets();
		const result = await run('createImageSet', fields([photo]), { cookies, pass: null });
		expect(isActionFailure(result) && result.status).toBe(401);
		expect(isActionFailure(result) && result.data).toMatchObject({
			locked: true,
			// A tap alone doesn't restart the photographs the lapse stopped: the
			// message, beside the button, says to try those again before submitting.
			imageSetError:
				'The Archive has drifted shut. Visit the Cube to open the Archive, press “Try again” on any photographs marked “Not uploaded”, then “Add to the archive” — your entry is kept.'
		});
		expect(await countSets()).toBe(before);
		expect((await db.select().from(image).where(eq(image.id, photo.id)).get())?.setId).toBeNull();
	});

	it("refuses photographs that aren't this draft's own unattached uploads", async () => {
		const { cookies, upload: add } = anonymousDraft();
		const own = await add();

		const someoneElses = await anonymousDraft().upload();
		const keepers = await upload({ userId: ADMIN.id });
		// This draft's own, but already submitted in a set of its own.
		const attached = await add();
		expect(submittedOf(await run('createImageSet', fields([attached]), { cookies }))).toBeDefined();

		for (const foreign of [someoneElses, keepers, attached, { id: 999_999 }]) {
			const before = await countSets();
			const result = await run(
				'createImageSet',
				fields([own, foreign], { description: 'Mine', event: 'Vetted Concert' }),
				{ cookies }
			);
			expect(isActionFailure(result) && result.status, `image ${foreign.id}`).toBe(400);
			// Said in place, with what was typed handed back for the form to keep.
			expect(isActionFailure(result) && result.data).toMatchObject({
				imageSetError: 'Those photographs could not be attached.',
				values: { description: 'Mine', event: 'Vetted Concert' }
			});
			expect(await countSets()).toBe(before);
		}
		// Its own photograph is still free for a submission that holds only its own.
		expect((await db.select().from(image).where(eq(image.id, own.id)).get())?.setId).toBeNull();
		expect(submittedOf(await run('createImageSet', fields([own]), { cookies }))).toBeDefined();
	});

	it('refuses an empty set, echoing what was typed', async () => {
		const { cookies } = anonymousDraft();
		const result = await run(
			'createImageSet',
			{ dateAuto: 'on', description: 'Nothing yet', event: 'Vetted Concert' },
			{ cookies }
		);
		expect(isActionFailure(result) && result.status).toBe(400);
		expect(isActionFailure(result) && result.data).toMatchObject({
			errors: { imageIds: expect.any(Array) },
			values: { description: 'Nothing yet', event: 'Vetted Concert', imageIds: [] }
		});
	});

	it('lands a proposed, unattributed set: photographs in order, dated by the earliest', async () => {
		const { cookies, upload: add } = anonymousDraft();
		const later = await add('2024-05-03T10:00:00');
		const undated = await add(null);
		const earliest = await add('2024-04-30T23:59:00');

		const result = await run(
			'createImageSet',
			fields([later, undated, earliest], {
				description: '  Spring planting  ',
				event: 'Vetted Concert'
			}),
			{ cookies }
		);
		const { id } = submittedOf(result);
		expect(result).toEqual({ submitted: { id } });
		expect(await setRow(id)).toMatchObject({
			proposedAddition: true,
			createdBy: null,
			description: 'Spring planting',
			eventId: 1,
			date: '2024-04-30',
			dateAuto: true
		});
		expect(await members(id)).toEqual([
			[later.id, 0],
			[undated.id, 1],
			[earliest.id, 2]
		]);
	});

	it('follows the photographs for the date even without the hidden dateAuto field', async () => {
		const { cookies, upload: add } = anonymousDraft();
		const photo = await add('2023-09-12T08:00:00');
		const { id } = submittedOf(
			await run('createImageSet', { imageIds: String(photo.id) }, { cookies })
		);
		expect(await setRow(id)).toMatchObject({ date: '2023-09-12', dateAuto: true });
	});

	it('counts a capture time that records only the day', async () => {
		const { cookies, upload: add } = anonymousDraft();
		const { id } = submittedOf(
			await run(
				'createImageSet',
				fields([await add('2021-03-05T09:00:00'), await add('2021-03-04')]),
				{ cookies }
			)
		);
		expect((await setRow(id))?.date).toBe('2021-03-04');
	});

	it('is undated when no photograph records when it was taken', async () => {
		const { cookies, upload: add } = anonymousDraft();
		const { id } = submittedOf(
			await run('createImageSet', fields([await add(), await add()]), { cookies })
		);
		expect((await setRow(id))?.date).toBeNull();
	});

	it('links an anonymous submission to an event still awaiting review', async () => {
		const { cookies, upload: add } = anonymousDraft();
		const result = await run('createImageSet', fields([await add()], { event: 'Pending Picnic' }), {
			cookies
		});
		const { id } = submittedOf(result);
		expect((await setRow(id))?.eventId).toBe(2);
	});

	it('leaves the set unlinked when no event has the title typed', async () => {
		const { cookies, upload: add } = anonymousDraft();
		const { id } = submittedOf(
			await run('createImageSet', fields([await add()], { event: 'A Picnic Nobody Held' }), {
				cookies
			})
		);
		expect(await setRow(id)).toMatchObject({ eventId: null, proposedAddition: true });
	});

	it('is rate limited per address', async () => {
		const ip = '203.0.113.50';
		await exhaust('submit-ip', ip, LIMITS.submitPerIp);
		const { cookies, upload: add } = anonymousDraft();
		const before = await countSets();
		const result = await run('createImageSet', fields([await add()]), { cookies, ip });
		expect(isActionFailure(result) && result.status).toBe(429);
		expect(await countSets()).toBe(before);
	});
});

describe('createImageSet (signed in)', () => {
	/** The new set's id, from a redirect to its keeper page flagged as just created. */
	function createdId(result: unknown): number {
		expect(isRedirect(result)).toBe(true);
		const match = (result as { location: string }).location.match(
			/^\/keeper\/images\/(\d+)\?created$/
		);
		expect(match).not.toBeNull();
		return Number(match![1]);
	}

	it("lands an admin's set vetted and attributed, then redirects to it", async () => {
		const first = await upload({ userId: ADMIN.id }, '2022-01-02T03:04:05');
		const second = await upload({ userId: ADMIN.id });
		// Keepers write without a draft session.
		const result = await run(
			'createImageSet',
			fields([second, first], { event: 'Pending Picnic' }),
			{ as: ADMIN }
		);
		const id = createdId(result);
		expect(await setRow(id)).toMatchObject({
			proposedAddition: false,
			createdBy: ADMIN.id,
			eventId: 2,
			date: '2022-01-02'
		});
		expect(await members(id)).toEqual([
			[second.id, 0],
			[first.id, 1]
		]);
	});

	it("lands a contributor's set for review, still on its keeper page", async () => {
		const photo = await upload({ userId: CONTRIBUTOR.id });
		// Every event is public, so a set under review may link one under review too.
		const id = createdId(
			await run('createImageSet', fields([photo], { event: 'Pending Picnic' }), {
				as: CONTRIBUTOR
			})
		);
		expect(await setRow(id)).toMatchObject({
			proposedAddition: true,
			createdBy: CONTRIBUTOR.id,
			eventId: 2
		});
	});

	it("refuses another keeper's or a draft's uploads", async () => {
		for (const foreign of [
			await upload({ userId: CONTRIBUTOR.id }),
			await anonymousDraft().upload()
		]) {
			const before = await countSets();
			const result = await run('createImageSet', fields([foreign]), { as: ADMIN });
			expect(isActionFailure(result) && result.status).toBe(400);
			expect(await countSets()).toBe(before);
		}
	});
});
