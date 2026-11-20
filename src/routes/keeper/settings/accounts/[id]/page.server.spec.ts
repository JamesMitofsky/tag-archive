import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { artefact, user } = await import('#lib/server/db/schema.ts');
const { loadListenerArtefacts } = await import('#lib/server/listeners.ts');
const { actions, load } = await import('./+page.server');

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ id: 'a', name: 'Ada Admin', email: 'a@test', role: 'admin' },
		{ id: 'c', name: 'Cal', email: 'c@test', role: 'contributor' },
		{ id: 'l', name: 'Lena', email: 'l@test', role: 'listener' }
	]);
	await db.insert(artefact).values([
		{ id: 1, artefact: 'Program' },
		{ id: 2, artefact: 'Zine' }
	]);
});

const admin = { user: { id: 'a', email: 'a@test', role: 'admin' } };
const contributor = { user: { id: 'c', email: 'c@test', role: 'contributor' } };
const listener = { listener: { id: 'l', email: 'l@test', role: 'listener' } };

function post(ids: string[]) {
	const body = new FormData();
	for (const id of ids) body.append('artefact', id);
	return new Request('https://archive.test/keeper/settings/accounts/l', { method: 'POST', body });
}

async function save(id: string, ids: string[], locals: object = admin) {
	try {
		return await actions.save({ request: post(ids), locals, params: { id } } as never);
	} catch (thrown) {
		return { thrown: thrown as { status: number } };
	}
}

const givenTo = async (id: string) => (await loadListenerArtefacts(id)).map((a) => a.id).sort();

describe('/keeper/settings/accounts/[id]', () => {
	it('is for admins only, on the load and on the action', async () => {
		for (const locals of [contributor, listener, {}]) {
			await expect(load({ locals, params: { id: 'l' } } as never)).rejects.toMatchObject({
				status: 303
			});
			expect(await save('l', ['1'], locals)).toMatchObject({ thrown: { status: 303 } });
		}
		expect(await givenTo('l')).toEqual([]);
	});

	it('saves what was ticked, and loads it back ticked', async () => {
		expect(await save('l', ['2', '1', 'nope', '-3'])).toEqual({ saved: true });
		expect(await givenTo('l')).toEqual([1, 2]);
		expect(await save('l', ['2'])).toEqual({ saved: true });
		const data = (await load({ locals: admin, params: { id: 'l' } } as never)) as {
			isListener: boolean;
			choices: { id: number; chosen: boolean }[];
		};
		expect(data.isListener).toBe(true);
		expect(data.choices.map((c) => [c.id, c.chosen])).toEqual([
			[1, false],
			[2, true]
		]);
	});

	it('chooses nothing for an account that is not a listener', async () => {
		const data = (await load({ locals: admin, params: { id: 'c' } } as never)) as {
			isListener: boolean;
			choices: unknown[];
		};
		expect(data).toMatchObject({ isListener: false, choices: [] });
		expect(await save('c', ['1'])).toMatchObject({ status: 400 });
	});

	it('answers 404 for an account that does not exist', async () => {
		await expect(load({ locals: admin, params: { id: 'x' } } as never)).rejects.toMatchObject({
			status: 404
		});
		expect(await save('x', ['1'])).toMatchObject({ status: 404 });
	});
});
