import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
const deleteScan = vi.hoisted(() => vi.fn(async (_key: string) => {}));
vi.mock('$lib/server/scans', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/scans')>()),
	deleteScan
}));
// Not under test here; keep the metadata parser out of the import graph.
vi.mock('$lib/server/imageMetadata', () => ({ parseImageMetadata: vi.fn() }));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { image, imageSet, user } = await import('$lib/server/db/schema');
const { DRAFT_COOKIE, mintDraftToken, submissionPrefix } = await import('$lib/server/drafts');
const { imageKeys } = await import('$lib/server/imageKeys');
const { DELETE } = await import('./+server');

/** An open access pass, as hooks.server.ts leaves it on `locals` ($lib/access/pass). */
const OPEN_PASS = { kind: 't' as const, issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER };
const KEEPER = { id: 'keeper-1' };

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ id: 'keeper-1', name: 'Keeper One', email: 'one@example.org' },
		{ id: 'keeper-2', name: 'Keeper Two', email: 'two@example.org' }
	]);
});
beforeEach(() => deleteScan.mockClear());

type Caller = { user?: { id: string }; pass?: typeof OPEN_PASS; draftToken?: string };

function visitor(): Caller & { prefix: string } {
	const { token, draft } = mintDraftToken();
	return { pass: OPEN_PASS, draftToken: token, prefix: submissionPrefix(draft.id) };
}

/** A finalized image row under `prefix`, created by `createdBy`, optionally in a set. */
async function stored(prefix: string, createdBy: string | null, setId: number | null = null) {
	const { originalKey, displayKey } = imageKeys(prefix, 'image/jpeg');
	const [row] = await db
		.insert(image)
		.values({
			setId,
			url: `https://bucket.test/${displayKey}`,
			originalUrl: `https://bucket.test/${originalKey}`,
			originalType: 'image/jpeg',
			originalBytes: 3_000_000,
			bytes: 180_000,
			width: 2560,
			height: 1707,
			createdBy,
			updatedBy: createdBy
		})
		.returning();
	return { ...row, originalKey, displayKey };
}

async function remove(caller: Caller, id: string | number) {
	const event = {
		params: { id: String(id) },
		locals: { user: caller.user, pass: caller.pass },
		cookies: {
			get: (name: string) => (name === DRAFT_COOKIE ? caller.draftToken : undefined)
		} as Cookies
	};
	try {
		// The handler reads only these fields of the RequestEvent.
		const response = await DELETE(event as never);
		return { status: response.status, body: await response.json() };
	} catch (thrown) {
		const { status, body } = thrown as { status: number; body: unknown };
		if (typeof status !== 'number') throw thrown;
		return { status, body };
	}
}

const exists = async (id: number) =>
	!!(await db.select().from(image).where(eq(image.id, id)).get());

describe('DELETE /api/images/[id]', () => {
	it("deletes a visitor's own unattached image and both its objects", async () => {
		const caller = visitor();
		const row = await stored(caller.prefix, null);
		expect(await remove(caller, row.id)).toEqual({ status: 200, body: { success: true } });
		expect(await exists(row.id)).toBe(false);
		expect(deleteScan.mock.calls.map(([key]) => key).sort()).toEqual(
			[row.displayKey, row.originalKey].sort()
		);
	});

	it("deletes a keeper's own unattached image", async () => {
		const row = await stored('', KEEPER.id);
		expect((await remove({ user: KEEPER }, row.id)).status).toBe(200);
		expect(await exists(row.id)).toBe(false);
	});

	it("refuses someone else's image with 403", async () => {
		const owner = visitor();
		const theirs = await stored(owner.prefix, null);
		const anotherKeepers = await stored('', 'keeper-2');
		expect((await remove(visitor(), theirs.id)).status).toBe(403);
		expect((await remove({ user: KEEPER }, theirs.id)).status).toBe(403);
		expect((await remove({ user: KEEPER }, anotherKeepers.id)).status).toBe(403);
		expect((await remove(owner, anotherKeepers.id)).status).toBe(403);
		expect(await exists(theirs.id)).toBe(true);
		expect(await exists(anotherKeepers.id)).toBe(true);
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it('refuses an image already in a set with 409', async () => {
		const caller = visitor();
		const [set] = await db.insert(imageSet).values({ proposedAddition: true }).returning();
		const row = await stored(caller.prefix, null, set.id);
		expect((await remove(caller, row.id)).status).toBe(409);
		expect(await exists(row.id)).toBe(true);
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it('answers 404 for an unknown or malformed id', async () => {
		for (const id of [999_999, 0, -1, 'abc', '1.5']) {
			expect((await remove({ user: KEEPER }, id)).status).toBe(404);
		}
	});

	it('answers locked without a pass, or with a pass but no draft', async () => {
		const caller = visitor();
		const row = await stored(caller.prefix, null);
		for (const locked of [{ draftToken: caller.draftToken }, { pass: OPEN_PASS }]) {
			const { status, body } = await remove(locked, row.id);
			expect(status).toBe(401);
			expect(body).toMatchObject({ code: 'locked' });
		}
		expect(await exists(row.id)).toBe(true);
	});
});
