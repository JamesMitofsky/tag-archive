import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'listening-secret';
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());
vi.mock('$app/env', () => ({ dev: false, building: false }));

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { artefact, user } = await import('#lib/server/db/schema.ts');
const { verifyFileGrant } = await import('#lib/access/fileGrant.ts');
const { setListenerArtefacts } = await import('#lib/server/listeners.ts');
const { load } = await import('./+page.server');

const BUCKET = 'https://pub.r2.test/scans/0b9c.webp';

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ id: 'admin', name: 'Ada', email: 'a@test', role: 'admin' },
		{ id: 'lena', name: 'Lena', email: 'l@test', role: 'listener' }
	]);
	await db.insert(artefact).values([
		{
			id: 1,
			artefact: 'Program',
			location: 'Binder',
			fileUrls: ['/artefacts/A program.webp', BUCKET]
		},
		{ id: 2, artefact: 'Not for Lena' }
	]);
	await setListenerArtefacts('admin', 'lena', [1]);
});

async function run(locals: object) {
	const headers: Record<string, string> = {};
	try {
		const data = await load({
			locals,
			setHeaders: (h: object) => Object.assign(headers, h)
		} as never);
		return { data: data as { artefacts: Record<string, unknown>[] }, headers };
	} catch (thrown) {
		return { thrown: thrown as { status: number; location: string }, headers };
	}
}

const lena = { listener: { id: 'lena', email: 'l@test', role: 'listener' } };

describe('/listening', () => {
	it('shows a listener their artefacts alone, with only what a card draws', async () => {
		const { data, headers } = await run(lena);
		expect(headers['cache-control']).toBe('private, no-store');
		expect(data?.artefacts.map((a) => a.id)).toEqual([1]);
		expect(Object.keys(data!.artefacts[0]).sort()).toEqual(
			[
				'artefact',
				'date',
				'description',
				'event',
				'fileUrls',
				'id',
				'programArea',
				'provenance'
			].sort()
		);
	});

	it('signs the scans shipped with the deployment, and leaves bucket URLs alone', async () => {
		const { data } = await run(lena);
		const [local, remote] = data!.artefacts[0].fileUrls as string[];
		expect(remote).toBe(BUCKET);
		const url = new URL(local, 'https://archive.test');
		const request = { pathname: url.pathname, search: url.search, method: 'GET' };
		expect(await verifyFileGrant('listening-secret', request)).toBe(true);
	});

	it('sends a keeper, or anyone in from the garden, to the whole archive', async () => {
		const keeper = { user: { id: 'admin', email: 'a@test', role: 'admin' } };
		expect((await run(keeper)).thrown).toMatchObject({ status: 303, location: '/' });
		const tapped = { pass: { kind: 't', issuedAt: 0, expiresAt: Infinity } };
		expect((await run(tapped)).thrown).toMatchObject({ status: 303, location: '/' });
	});

	it('sends anyone else to the locked page', async () => {
		const stray = { listenerPass: { kind: 'l', issuedAt: 0, expiresAt: Infinity } };
		for (const locals of [{}, stray]) {
			expect((await run(locals)).thrown).toMatchObject({ status: 303, location: '/locked' });
		}
	});
});
