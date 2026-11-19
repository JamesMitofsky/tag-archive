import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { keyOpens, listKeys } = await import('$lib/server/remoteKeys');
const { utcDate } = await import('$lib/validation/remoteKey');
const { actions, load } = await import('./+page.server');

beforeAll(migrateTestDatabase);

const admin = { user: { id: 'a', email: 'a@test', role: 'admin' } };
const contributor = { user: { id: 'c', email: 'c@test', role: 'contributor' } };

function post(fields: Record<string, string>) {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.set(name, value);
	return new Request('https://archive.test/keeper/settings/keys', { method: 'POST', body });
}

async function run(
	action: keyof typeof actions,
	fields: Record<string, string>,
	locals: object = admin
) {
	try {
		return await actions[action]({ request: post(fields), locals } as never);
	} catch (thrown) {
		return { thrown: thrown as { status: number; location: string } };
	}
}

describe('/keeper/settings/keys', () => {
	it('is for admins only, on the load and on every action', async () => {
		for (const locals of [contributor, {}]) {
			await expect(
				load({ locals, url: new URL('https://archive.test') } as never)
			).rejects.toMatchObject({ status: 303 });
			for (const action of ['create', 'setExpiry', 'end', 'delete'] as const) {
				const result = await run(action, { key: 'sneaky', expiresOn: '2999-01-01' }, locals);
				expect(result, action).toMatchObject({ thrown: { status: 303 } });
			}
		}
		expect(await listKeys()).toEqual([]);
	});

	it('offers a week from today and the link a key opens through', async () => {
		const data = await load({ locals: admin, url: new URL('https://archive.test') } as never);
		expect(data).toMatchObject({
			defaultExpiresOn: utcDate(new Date(), 7),
			linkBase: 'https://archive.test/?whoislisteningwiththevoiceofthegarden='
		});
	});

	it('creates a key, lowercased, and refuses it twice', async () => {
		expect(await run('create', { key: 'TobyShorin', expiresOn: utcDate(new Date(), 7) })).toEqual({
			created: 'tobyshorin'
		});
		expect(await keyOpens('tobyshorin')).toBe(true);
		expect(await run('create', { key: 'tobyshorin', expiresOn: utcDate() })).toMatchObject({
			status: 400,
			data: { create: { errors: { key: ['That key is already in use'] } } }
		});
	});

	it('refuses an expiry in the past', async () => {
		expect(await run('create', { key: 'late', expiresOn: '2001-01-01' })).toMatchObject({
			status: 400,
			data: { create: { errors: { expiresOn: expect.any(Array) } } }
		});
		expect(await run('setExpiry', { key: 'tobyshorin', expiresOn: '2001-01-01' })).toMatchObject({
			status: 400,
			data: { edit: { key: 'tobyshorin' } }
		});
	});

	it('closes, reopens and deletes a key', async () => {
		expect(await run('end', { key: 'tobyshorin' })).toEqual({ ended: 'tobyshorin' });
		expect(await keyOpens('tobyshorin', new Date(Date.now() + 1000))).toBe(false);
		expect(await run('setExpiry', { key: 'tobyshorin', expiresOn: utcDate() })).toEqual({
			updated: 'tobyshorin'
		});
		expect(await keyOpens('tobyshorin')).toBe(true);
		expect(await run('delete', { key: 'tobyshorin' })).toEqual({ deleted: 'tobyshorin' });
		expect(await run('delete', { key: 'tobyshorin' })).toMatchObject({ status: 404 });
	});
});
