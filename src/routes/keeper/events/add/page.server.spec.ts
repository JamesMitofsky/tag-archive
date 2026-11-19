import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { artefact, event, eventFeatureImage, user } = await import('$lib/server/db/schema');
const { actions } = await import('./+page.server');

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };
const CONTRIBUTOR = { id: 'contrib-1', role: 'contributor', email: 'contrib@example.org' };
const URL_ = 'https://bucket.test/submissions/poster.webp';
let artefactId: number;

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ ...ADMIN, name: 'Admin' },
		{ ...CONTRIBUTOR, name: 'Contributor' }
	]);
	[{ id: artefactId }] = await db
		.insert(artefact)
		.values({ artefact: 'Poster', date: '2024', fileUrls: [URL_] })
		.returning({ id: artefact.id });
});

async function createEvent(as: typeof ADMIN, fields: Record<string, string>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const request = {
		locals: { user: as },
		request: new Request('http://localhost/', { method: 'POST', body })
	};
	try {
		// The action reads only these fields of the RequestEvent.
		return await actions.createEvent(request as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

const byTitle = (title: string) => db.select().from(event).where(eq(event.title, title));
const featureOf = (eventId: number) =>
	db.select().from(eventFeatureImage).where(eq(eventFeatureImage.eventId, eventId));

describe('createEvent feature image', () => {
	it('creates the event with the chosen image', async () => {
		const result = await createEvent(CONTRIBUTOR, {
			title: 'Poster Night',
			date: '2024-09-01',
			featureImage: `artefact:${artefactId}:${URL_}`
		});
		expect(isRedirect(result) && result.location).toBe('/keeper/events');

		const [created] = await byTitle('Poster Night');
		// A contributor's event still lands as a proposed addition.
		expect(created.proposedAddition).toBe(true);
		expect(await featureOf(created.id)).toEqual([
			expect.objectContaining({ artefactId, artefactFileUrl: URL_, createdBy: CONTRIBUTOR.id })
		]);
	});

	it('creates the event with no image when none was chosen', async () => {
		await createEvent(ADMIN, { title: 'Plain Night', date: '2024-09-02', featureImage: '' });
		const [created] = await byTitle('Plain Night');
		expect(await featureOf(created.id)).toEqual([]);
	});

	it('refuses an image that is not there, and creates no event', async () => {
		for (const [title, featureImage] of [
			['Gone Image', 'image:999999'],
			['Gone Page', `artefact:${artefactId}:https://bucket.test/submissions/gone.webp`],
			['Garbled', 'not a ref']
		]) {
			const result = await createEvent(ADMIN, { title, date: '2024-09-03', featureImage });
			expect(isActionFailure(result) && result.status, featureImage).toBe(400);
			expect(isActionFailure(result) && result.data).toMatchObject({
				errors: { featureImage: [expect.any(String)] },
				values: { title, featureImage }
			});
			expect(await byTitle(title)).toEqual([]);
		}
	});
});
