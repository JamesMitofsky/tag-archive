import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { artefact, numberConfirmation, user } = await import('$lib/server/db/schema');
const { actions, load } = await import('./+page.server');

const KEEPER = { id: 'keeper-1', role: 'contributor', email: 'keeper@example.org' };
const OTHER = { id: 'keeper-2', role: 'admin', email: 'other@example.org' };

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ ...KEEPER, name: 'Keeper' },
		{ ...OTHER, name: 'Other' }
	]);
	await db.insert(artefact).values([
		{ id: 1, artefact: 'Unlabeled program', date: '2024' },
		{ id: 2, artefact: 'Twice confirmed', date: '2024' }
	]);
});

type Actor = typeof KEEPER | null;

async function confirm(id: string, actor: Actor) {
	const event = { params: { id }, locals: actor ? { user: actor } : {} };
	try {
		// The action types expect a full RequestEvent; these fields are all it reads.
		return await actions.confirmNumber(event as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

async function loaded(id: string) {
	// The load types expect a full ServerLoadEvent; these fields are all it reads.
	const data = await load({ params: { id }, locals: { user: KEEPER } } as never);
	return (data as { artefact: { numberConfirmedAt: Date | null } }).artefact;
}

const confirmation = async (id: number) =>
	(await db.select().from(numberConfirmation).where(eq(numberConfirmation.artefactId, id)))[0];

describe('confirmNumber', () => {
	it('loads a new artefact as unconfirmed', async () => {
		expect((await loaded('1')).numberConfirmedAt).toBeNull();
	});

	it('refuses an anonymous visitor', async () => {
		const result = await confirm('1', null);
		expect(isActionFailure(result) && result.status).toBe(401);
		expect(await confirmation(1)).toBeUndefined();
	});

	it('404s for an artefact that does not exist', async () => {
		const result = await confirm('999', KEEPER);
		expect(isActionFailure(result) && result.status).toBe(404);
	});

	it('records who confirmed, then lands back on the page without `?created`', async () => {
		const result = await confirm('1', KEEPER);
		expect(isRedirect(result) && result.location).toBe('/keeper/artefacts/1');
		expect(await confirmation(1)).toMatchObject({ createdBy: KEEPER.id });
		expect((await loaded('1')).numberConfirmedAt).toBeInstanceOf(Date);
	});

	it('keeps the first confirmation when confirmed again', async () => {
		await confirm('2', KEEPER);
		const first = await confirmation(2);
		const again = await confirm('2', OTHER);
		expect(isRedirect(again)).toBe(true);
		expect(await confirmation(2)).toEqual(first);
	});
});
