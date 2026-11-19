import { isActionFailure } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());
// Record storage deletes and cache purges instead of calling R2 and Vercel.
vi.mock('#lib/server/scans.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/scans.ts')>()),
	deleteScan: vi.fn(async () => {})
}));
vi.mock('#lib/server/cache.ts', () => ({ purgeArchiveCache: vi.fn(async () => {}) }));

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { artefact, user } = await import('#lib/server/db/schema.ts');
const { actions } = await import('./+page.server');

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

async function proposed(title: string) {
	const [{ id }] = await db
		.insert(artefact)
		.values({ artefact: title, date: '2026', proposedAddition: true })
		.returning({ id: artefact.id });
	return id;
}

async function act(name: 'approve' | 'reject', id: number | string, caller: Caller = ADMIN) {
	const body = new FormData();
	body.append('id', String(id));
	const event = {
		request: new Request('http://localhost/keeper/artefacts', { method: 'POST', body }),
		locals: caller ? { user: caller } : {}
	};
	return actions[name]!(event as never);
}

const row = (id: number) => db.select().from(artefact).where(eq(artefact.id, id)).get();

describe('reviewing from the artefacts list', () => {
	it('approves a proposed artefact in place', async () => {
		const id = await proposed('Flyer to keep');
		expect(await act('approve', id)).toEqual({ approved: true });
		expect(await row(id)).toMatchObject({ proposedAddition: false, updatedBy: ADMIN.id });
	});

	it('rejects a proposed artefact by deleting it', async () => {
		const id = await proposed('Flyer to drop');
		expect(await act('reject', id)).toEqual({ rejected: true });
		expect(await row(id)).toBeUndefined();
	});

	it('never deletes an artefact that is already vetted', async () => {
		const id = await proposed('Vetted flyer');
		await act('approve', id);
		await act('reject', id);
		expect(await row(id)).toMatchObject({ proposedAddition: false });
	});

	it('refuses anyone who is not an admin, leaving the row pending', async () => {
		const id = await proposed('Still pending');
		for (const [caller, status] of [
			[null, 401],
			[KEEPER, 403]
		] as const) {
			for (const name of ['approve', 'reject'] as const) {
				const result = await act(name, id, caller);
				expect(isActionFailure(result) && result.status).toBe(status);
			}
		}
		expect(await row(id)).toMatchObject({ proposedAddition: true });
	});

	it('rejects an id that does not parse', async () => {
		const result = await act('approve', 'not-a-number');
		expect(isActionFailure(result) && result.status).toBe(400);
	});
});
