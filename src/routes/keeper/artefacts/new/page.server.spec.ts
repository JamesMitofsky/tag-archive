import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { artefact, event, user } = await import('#lib/server/db/schema.ts');
const { load, actions } = await import('./+page.server');
const add = await import('../add/+page.server');

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };
const TEMPERANCE = 'Temperance Alley Beautification';
const CONTRIBUTOR = { id: 'contributor-1', role: 'contributor', email: 'c@example.org' };

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ ...ADMIN, name: 'Admin' },
		{ ...CONTRIBUTOR, name: 'Contributor' }
	]);
	await db.insert(artefact).values({ artefact: 'Kept', date: '2024', location: 'Binder 3' });
	await db.insert(event).values([
		// A recurring title: one row per Saturday. Inserted out of date order, so
		// "earliest" can't pass by being the lowest id.
		{ id: 12, title: TEMPERANCE, date: '2021-05-01' },
		{ id: 10, title: TEMPERANCE, date: '2021-04-17' },
		{ id: 11, title: TEMPERANCE, date: '2021-04-24' },
		{ id: 13, title: TEMPERANCE, date: '2021-05-08' },
		{ id: 14, title: TEMPERANCE, date: '2021-05-15', proposedAddition: true },
		{ id: 20, title: 'Morning Meditation', date: '2021-06-16' }
	]);
});

async function caught(run: () => unknown) {
	try {
		return await run();
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

async function create(fields: Record<string, string | string[]>, who: typeof ADMIN | null) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		for (const v of Array.isArray(value) ? value : [value]) body.append(key, v);
	}
	const request = new Request('http://localhost/keeper/artefacts/new', { method: 'POST', body });
	// The action types expect a full RequestEvent; these fields are all it reads.
	return caught(() =>
		actions.createArtefact({ request, locals: who ? { user: who } : {} } as never)
	);
}

const filled = {
	artefact: 'Garden program',
	date: '2023-07',
	location: 'Binder',
	fileUrls: ['https://bucket.test/a.webp']
};

/** The id from a `/keeper/artefacts/{id}?created` redirect. */
function createdId(result: unknown): number {
	const match = (result as { location: string }).location.match(
		/^\/keeper\/artefacts\/(\d+)\?created$/
	);
	expect(match).not.toBeNull();
	return Number(match![1]);
}

async function row(id: number) {
	const [found] = await db.select().from(artefact).where(eq(artefact.id, id));
	return found;
}

describe('/keeper/artefacts/new load', () => {
	it('offers the storage locations already in use', async () => {
		const data = await load({ locals: { user: ADMIN } } as never);
		expect(data).toMatchObject({ locations: ['Binder 3'] });
	});

	it('sends anyone without a session to sign in', async () => {
		const result = await caught(() => load({ locals: {} } as never));
		expect(isRedirect(result) && result.location).toBe('/keeper');
	});
});

describe('/keeper/artefacts/new createArtefact', () => {
	it('refuses without a session', async () => {
		const result = await create(filled, null);
		expect(isActionFailure(result) && result.status).toBe(401);
	});

	it('answers a failed save as a failed submit, with the form echoed back to keep', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		// A session whose user row is gone: the insert's foreign key refuses it.
		const ghost = { id: 'no-such-user', role: 'admin', email: 'ghost@example.org' };

		const result = await create(filled, ghost);

		// Not thrown: thrown, it would put the error page where the form was.
		expect(isActionFailure(result) && result.status).toBe(500);
		expect(isActionFailure(result) && result.data).toMatchObject({
			values: { artefact: 'Garden program', fileUrls: ['https://bucket.test/a.webp'] }
		});
		expect(logged).toHaveBeenCalled();
		logged.mockRestore();
	});

	it('requires a location, echoing what was typed', async () => {
		const result = await create({ ...filled, location: '' }, ADMIN);
		expect(isActionFailure(result) && result.status).toBe(400);
		expect(isActionFailure(result) && result.data).toMatchObject({
			values: { artefact: 'Garden program', date: '2023-07', fileUrls: filled.fileUrls }
		});
	});

	it("lands an admin's artefact vetted and attributed, on its page", async () => {
		const id = createdId(await create(filled, ADMIN));
		expect(await row(id)).toMatchObject({
			proposedAddition: false,
			createdBy: ADMIN.id,
			location: 'Binder'
		});
	});

	it("lands a contributor's artefact as a proposed addition, for an admin to vet", async () => {
		const id = createdId(await create(filled, CONTRIBUTOR));
		expect(await row(id)).toMatchObject({
			proposedAddition: true,
			createdBy: CONTRIBUTOR.id
		});
	});
});

describe('/keeper/artefacts/new createArtefact, linking a recurring event', () => {
	const linked = async (fields: Record<string, string>, who = ADMIN) =>
		(await row(createdId(await create({ ...filled, ...fields }, who)))).eventId;

	it('links the occurrence picked from the list', async () => {
		expect(await linked({ event: TEMPERANCE, eventId: '12' })).toBe(12);
		expect(await linked({ event: TEMPERANCE, eventId: '13' })).toBe(13);
	});

	it('resolves a typed-in title, or an old draft without the id, to its earliest occurrence', async () => {
		expect(await linked({ event: TEMPERANCE })).toBe(10);
		expect(await linked({ event: TEMPERANCE, eventId: '' })).toBe(10);
	});

	it('falls back to the title when the id does not name an event of that title', async () => {
		// Another title's id: the text was changed after the pick, or the id forged.
		expect(await linked({ event: TEMPERANCE, eventId: '20' })).toBe(10);
		expect(await linked({ event: TEMPERANCE, eventId: '9999' })).toBe(10);
		expect(await linked({ event: TEMPERANCE, eventId: 'not-an-id' })).toBe(10);
		// And an id never links an event whose title the form doesn't name.
		expect(await linked({ event: 'No such event', eventId: '12' })).toBeNull();
	});

	it("keeps a contributor's proposed artefact to vetted occurrences, by id as by title", async () => {
		expect(await linked({ event: TEMPERANCE, eventId: '12' }, CONTRIBUTOR)).toBe(12);
		expect(await linked({ event: TEMPERANCE, eventId: '14' }, CONTRIBUTOR)).toBe(10);
		// An admin may link the pending one.
		expect(await linked({ event: TEMPERANCE, eventId: '14' })).toBe(14);
	});

	it('echoes the picked occurrence back with a refused form', async () => {
		const result = await create(
			{ ...filled, location: '', event: TEMPERANCE, eventId: '12' },
			ADMIN
		);
		expect(isActionFailure(result) && result.data).toMatchObject({
			values: { event: TEMPERANCE, eventId: '12' }
		});
	});
});

describe('/keeper/artefacts/add', () => {
	it('sends old links on to the keeper form for good', async () => {
		const result = await caught(() => add.load({} as never));
		expect(isRedirect(result) && result).toMatchObject({
			status: 308,
			location: '/keeper/artefacts/new'
		});
	});
});
