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
const { artefact, user } = await import('#lib/server/db/schema.ts');
const { load, actions } = await import('./+page.server');
const add = await import('../add/+page.server');

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };
const CONTRIBUTOR = { id: 'contributor-1', role: 'contributor', email: 'c@example.org' };

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ ...ADMIN, name: 'Admin' },
		{ ...CONTRIBUTOR, name: 'Contributor' }
	]);
	await db.insert(artefact).values({ artefact: 'Kept', date: '2024', location: 'Binder 3' });
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

	it('offers a name from the last artefact on the next, even one awaiting review', async () => {
		// A contributor's artefact is a proposed addition, so the public dataset
		// leaves its people out until an admin vets it.
		createdId(await create({ ...filled, provenance: 'Newly Named' }, CONTRIBUTOR));

		const data = await load({ locals: { user: CONTRIBUTOR } } as never);
		expect(data).toMatchObject({ people: expect.arrayContaining(['Newly Named']) });
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

describe('/keeper/artefacts/add', () => {
	it('sends old links on to the keeper form for good', async () => {
		const result = await caught(() => add.load({} as never));
		expect(isRedirect(result) && result).toMatchObject({
			status: 308,
			location: '/keeper/artefacts/new'
		});
	});
});
