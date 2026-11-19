import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { user } = await import('#lib/server/db/schema.ts');
const { listAccounts } = await import('#lib/server/accounts.ts');
const { actions, load } = await import('./+page.server');

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ id: 'a', name: 'Ada Admin', email: 'a@test', role: 'admin' },
		{ id: 'c', name: 'cal Contributor', email: 'c@test', role: 'contributor' },
		{ id: 'b', name: 'Bea', email: 'b@test', role: 'contributor' }
	]);
});

const admin = { user: { id: 'a', email: 'a@test', role: 'admin' } };
const contributor = { user: { id: 'c', email: 'c@test', role: 'contributor' } };
const listener = { listener: { id: 'l', email: 'l@test', role: 'listener' } };

function post(fields: Record<string, string>) {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.set(name, value);
	return new Request('https://archive.test/keeper/settings/accounts', { method: 'POST', body });
}

async function setRole(fields: Record<string, string>, locals: object = admin) {
	try {
		return await actions.setRole({ request: post(fields), locals } as never);
	} catch (thrown) {
		return { thrown: thrown as { status: number; location: string } };
	}
}

const roleOf = async (id: string) => (await listAccounts()).find((a) => a.id === id)?.role;

describe('/keeper/settings/accounts', () => {
	it('is for admins only, on the load and on the action', async () => {
		for (const locals of [contributor, listener, {}]) {
			await expect(load({ locals } as never)).rejects.toMatchObject({ status: 303 });
			expect(await setRole({ id: 'b', role: 'admin' }, locals)).toMatchObject({
				thrown: { status: 303 }
			});
		}
		expect(await roleOf('b')).toBe('contributor');
	});

	it('lists every account by name, whatever its case, and says which is yours', async () => {
		const data = (await load({ locals: admin } as never)) as { accounts: { id: string }[] };
		expect(data.accounts.map((a) => a.id)).toEqual(['a', 'b', 'c']);
		expect(data).toMatchObject({ selfId: 'a', roles: ['contributor', 'listener', 'admin'] });
	});

	it('makes a contributor a listener, and back', async () => {
		expect(await setRole({ id: 'b', role: 'listener' })).toEqual({
			updated: { id: 'b', role: 'listener' }
		});
		expect(await roleOf('b')).toBe('listener');
		await setRole({ id: 'b', role: 'contributor' });
		expect(await roleOf('b')).toBe('contributor');
	});

	it('refuses a role it does not know', async () => {
		expect(await setRole({ id: 'b', role: 'superuser' })).toMatchObject({
			status: 400,
			data: { id: 'b', error: 'Pick a role' }
		});
		expect(await roleOf('b')).toBe('contributor');
	});

	it('refuses an admin’s own account, so the archive always keeps an admin', async () => {
		expect(await setRole({ id: 'a', role: 'listener' })).toMatchObject({
			status: 400,
			data: { id: 'a', error: 'You can’t change your own role' }
		});
		expect(await roleOf('a')).toBe('admin');
	});

	it('says so when the account is gone', async () => {
		expect(await setRole({ id: 'nobody', role: 'admin' })).toMatchObject({ status: 404 });
	});
});
