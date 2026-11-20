import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { artefact, artefactProvenance, event, listenerArtefact, person, user } =
	await import('#lib/server/db/schema.ts');
const { countListenerArtefacts, listArtefactChoices, loadListenerArtefacts, setListenerArtefacts } =
	await import('./listeners');

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ id: 'admin', name: 'Ada', email: 'a@test', role: 'admin' },
		{ id: 'lena', name: 'Lena', email: 'l@test', role: 'listener' },
		{ id: 'lou', name: 'Lou', email: 'lou@test', role: 'listener' },
		{ id: 'cal', name: 'Cal', email: 'c@test', role: 'contributor' }
	]);
	await db.insert(event).values([
		{ id: 1, title: 'Vetted walk', date: '2024-05-01' },
		{ id: 2, title: 'Proposed jam', date: '2024-06-01', proposedAddition: true }
	]);
	await db.insert(artefact).values([
		{ id: 1, artefact: 'Program', eventId: 1, date: '2024-05-01', location: 'Binder' },
		{ id: 2, artefact: 'Zine', eventId: 2, date: '2024-06' },
		{ id: 3, artefact: 'Undated sign' },
		{ id: 4, artefact: 'Awaiting review', proposedAddition: true }
	]);
	await db.insert(person).values({ id: 1, name: 'Rachel' });
	await db.insert(artefactProvenance).values({ artefactId: 1, personId: 1 });
});

beforeEach(() => db.delete(listenerArtefact));

const given = async (userId: string) =>
	(await loadListenerArtefacts(userId)).map((a) => a.id).sort();

describe('loadListenerArtefacts', () => {
	it('loads only what was given to that account, newest first, the undated last', async () => {
		await setListenerArtefacts('admin', 'lena', [3, 1, 2]);
		await setListenerArtefacts('admin', 'lou', [3]);
		const rows = await loadListenerArtefacts('lena');
		expect(rows.map((a) => a.id)).toEqual([2, 1, 3]);
		expect(rows.find((a) => a.id === 1)).toMatchObject({
			event: 'Vetted walk',
			provenance: ['Rachel']
		});
		expect(await given('lou')).toEqual([3]);
		expect(await given('cal')).toEqual([]);
	});

	it('names an event only while it is vetted, like the public archive', async () => {
		await setListenerArtefacts('admin', 'lena', [2]);
		expect((await loadListenerArtefacts('lena'))[0]).toMatchObject({ id: 2, event: null });
	});

	it('hides a given artefact still awaiting review', async () => {
		await db.insert(listenerArtefact).values({ userId: 'lena', artefactId: 4 });
		expect(await given('lena')).toEqual([]);
		expect((await countListenerArtefacts()).get('lena')).toBeUndefined();
	});
});

describe('setListenerArtefacts', () => {
	it('gives exactly the chosen artefacts, replacing what was there', async () => {
		expect(await setListenerArtefacts('admin', 'lena', [1, 2])).toBe('updated');
		expect(await setListenerArtefacts('admin', 'lena', [2, 3, 3])).toBe('updated');
		expect(await given('lena')).toEqual([2, 3]);
		expect(await setListenerArtefacts('admin', 'lena', [])).toBe('updated');
		expect(await given('lena')).toEqual([]);
	});

	it('stamps who gave each artefact, and keeps the first stamp on a re-save', async () => {
		await setListenerArtefacts('admin', 'lena', [1]);
		await db.update(user).set({ role: 'admin' }).where(eq(user.id, 'cal'));
		await setListenerArtefacts('cal', 'lena', [1, 3]);
		await db.update(user).set({ role: 'contributor' }).where(eq(user.id, 'cal'));
		const rows = await db
			.select({ artefactId: listenerArtefact.artefactId, by: listenerArtefact.createdBy })
			.from(listenerArtefact)
			.orderBy(listenerArtefact.artefactId);
		expect(rows).toEqual([
			{ artefactId: 1, by: 'admin' },
			{ artefactId: 3, by: 'cal' }
		]);
	});

	it('ignores ids that name no vetted artefact', async () => {
		await setListenerArtefacts('admin', 'lena', [1, 4, 999]);
		const rows = await db.select().from(listenerArtefact);
		expect(rows.map((r) => r.artefactId)).toEqual([1]);
	});

	it('leaves alone a row for an artefact awaiting review, which the page never offers', async () => {
		await db.insert(listenerArtefact).values({ userId: 'lena', artefactId: 4 });
		await setListenerArtefacts('admin', 'lena', [1]);
		const rows = await db.select().from(listenerArtefact).orderBy(listenerArtefact.artefactId);
		expect(rows.map((r) => r.artefactId)).toEqual([1, 4]);
	});

	it('refuses an account that is not a listener, and one that does not exist', async () => {
		expect(await setListenerArtefacts('admin', 'cal', [1])).toBe('not-listener');
		expect(await setListenerArtefacts('admin', 'nobody', [1])).toBe('missing');
		expect(await db.select().from(listenerArtefact)).toEqual([]);
	});
});

describe('listArtefactChoices / countListenerArtefacts', () => {
	it('offers every vetted artefact by number, marking those given', async () => {
		await setListenerArtefacts('admin', 'lena', [3]);
		expect(await listArtefactChoices('lena')).toEqual([
			{ id: 1, artefact: 'Program', date: '2024-05-01', event: 'Vetted walk', chosen: false },
			{ id: 2, artefact: 'Zine', date: '2024-06', event: null, chosen: false },
			{ id: 3, artefact: 'Undated sign', date: null, event: null, chosen: true }
		]);
	});

	it('counts each account’s given artefacts', async () => {
		await setListenerArtefacts('admin', 'lena', [1, 2]);
		await setListenerArtefacts('admin', 'lou', [3]);
		expect(Object.fromEntries(await countListenerArtefacts())).toEqual({ lena: 2, lou: 1 });
	});
});

describe('listener_artefact', () => {
	it('goes with the artefact and with the account', async () => {
		await db.insert(user).values({ id: 'gone', name: 'Gone', email: 'g@test', role: 'listener' });
		await db.insert(artefact).values({ id: 9, artefact: 'Short-lived' });
		await setListenerArtefacts('admin', 'gone', [9, 1]);
		await setListenerArtefacts('admin', 'lena', [9]);
		await db.delete(artefact).where(eq(artefact.id, 9));
		expect(await given('lena')).toEqual([]);
		await db.delete(user).where(eq(user.id, 'gone'));
		expect(await db.select().from(listenerArtefact)).toEqual([]);
	});
});
