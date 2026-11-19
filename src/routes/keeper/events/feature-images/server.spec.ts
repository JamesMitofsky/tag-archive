import { isHttpError } from '@sveltejs/kit';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { artefact, event } = await import('#lib/server/db/schema.ts');
const { GET } = await import('./+server');

const CONTRIBUTOR = { id: 'contrib-1', role: 'contributor', email: 'contrib@example.org' };
let eventId: number;
let linkedId: number;
let otherId: number;

beforeAll(async () => {
	await migrateTestDatabase();
	[{ id: eventId }] = await db
		.insert(event)
		.values({ title: 'Concert', date: '2024-06-01' })
		.returning({ id: event.id });
	[{ id: linkedId }, { id: otherId }] = await db
		.insert(artefact)
		.values([
			{ artefact: 'Linked flyer', date: '2024', eventId, fileUrls: ['https://b.test/a.webp'] },
			{ artefact: 'Other flyer', date: '2024', fileUrls: ['https://b.test/b.webp'] }
		])
		.returning({ id: artefact.id });
});

async function get(search: string, user: typeof CONTRIBUTOR | null = CONTRIBUTOR) {
	const url = new URL(`http://localhost/keeper/events/feature-images${search}`);
	try {
		// The handler reads only these fields of the RequestEvent.
		const res = await GET({ url, locals: { user } } as never);
		return { status: res.status, body: await res.json() };
	} catch (thrown) {
		if (isHttpError(thrown)) return { status: thrown.status, body: null };
		throw thrown;
	}
}

const ids = (body: { groups: { id: number }[] }) => body.groups.map((g) => g.id).sort();

describe('GET /keeper/events/feature-images', () => {
	it('searches everything for an event still being created, for any keeper', async () => {
		const { status, body } = await get('?q=flyer');
		expect(status).toBe(200);
		expect(ids(body)).toEqual([linkedId, otherId].sort());
	});

	it("leaves out what is linked to the event it's given", async () => {
		const { body } = await get(`?q=flyer&event=${eventId}`);
		expect(ids(body)).toEqual([otherId]);
	});

	it('refuses a malformed event and an anonymous caller', async () => {
		expect((await get('?event=abc')).status).toBe(400);
		expect((await get('', null)).status).toBe(401);
	});
});
