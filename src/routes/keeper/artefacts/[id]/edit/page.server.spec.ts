import { isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());
const purgeArchiveCache = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('#lib/server/cache.ts', () => ({ purgeArchiveCache }));

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { artefact, event, user } = await import('#lib/server/db/schema.ts');
const { load, actions } = await import('./+page.server');

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };
const TEMPERANCE = 'Temperance Alley Beautification';
let artefactId: number;

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values({ ...ADMIN, name: 'Admin' });
	await db.insert(event).values([
		{ id: 10, title: TEMPERANCE, date: '2021-04-17' },
		{ id: 11, title: TEMPERANCE, date: '2021-05-01' }
	]);
	const [created] = await db
		.insert(artefact)
		.values({
			artefact: 'Planting flyer',
			eventId: 11,
			date: '2021-05-01',
			location: 'Binder 3',
			fileUrls: ['https://bucket.test/a.webp']
		})
		.returning({ id: artefact.id });
	artefactId = created.id;
});

async function save(fields: Record<string, string>) {
	const body = new FormData();
	const all = {
		artefact: 'Planting flyer',
		date: '2021-05-01',
		location: 'Binder 3',
		fileUrls: 'https://bucket.test/a.webp',
		...fields
	};
	for (const [key, value] of Object.entries(all)) body.append(key, value);
	const request = new Request(`http://localhost/keeper/artefacts/${artefactId}/edit`, {
		method: 'POST',
		body
	});
	try {
		// The action types expect a full RequestEvent; these fields are all it reads.
		return await actions.updateArtefact({
			request,
			params: { id: String(artefactId) },
			locals: { user: ADMIN }
		} as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

async function linkedEvent() {
	const [found] = await db
		.select({ eventId: artefact.eventId })
		.from(artefact)
		.where(eq(artefact.id, artefactId));
	return found.eventId;
}

describe('/keeper/artefacts/[id]/edit', () => {
	it('hands the form the linked occurrence, not just its title', async () => {
		const data = await load({
			params: { id: String(artefactId) },
			locals: { user: ADMIN }
		} as never);
		expect(data).toMatchObject({ artefact: { event: TEMPERANCE, eventId: 11 } });
	});

	it('keeps the linked occurrence through a save, rather than moving to the earliest', async () => {
		const result = await save({ event: TEMPERANCE, eventId: '11', description: 'Edited' });
		expect(isRedirect(result)).toBe(true);
		expect(await linkedEvent()).toBe(11);
	});

	it('resolves the title alone when no occurrence comes with it', async () => {
		await save({ event: TEMPERANCE, eventId: '' });
		expect(await linkedEvent()).toBe(10);
	});
});
