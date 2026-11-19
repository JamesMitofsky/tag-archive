import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { artefact, event, image, imageSet, user } = await import('#lib/server/db/schema.ts');
const { actions } = await import('./+page.server');

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };
const KEEPER = { id: 'keeper-1', role: 'contributor', email: 'keeper@example.org' };

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ ...ADMIN, name: 'Admin' },
		{ ...KEEPER, name: 'Keeper' }
	]);
});

async function deleteEvent(id: number, as: typeof ADMIN) {
	const request = { params: { id: String(id) }, locals: { user: as } };
	try {
		// The action reads only these fields of the RequestEvent.
		return await actions.deleteEvent(request as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

describe('deleteEvent', () => {
	it('unlinks the artefacts and image sets that point at the event, then deletes it', async () => {
		const [{ id }] = await db
			.insert(event)
			.values({ title: 'Garden Concert', date: '2024-06-01' })
			.returning({ id: event.id });
		const [{ id: artefactId }] = await db
			.insert(artefact)
			.values({ artefact: 'Program', date: '2024', eventId: id })
			.returning({ id: artefact.id });
		const [{ id: setId }] = await db
			.insert(imageSet)
			.values({ eventId: id })
			.returning({ id: imageSet.id });
		await db.insert(image).values({
			setId,
			url: 'https://bucket.test/images/x/display.webp',
			originalUrl: 'https://bucket.test/images/x/original.jpg',
			originalType: 'image/jpeg',
			originalBytes: 10,
			bytes: 5,
			width: 4,
			height: 3
		});

		const result = await deleteEvent(id, ADMIN);
		expect(isRedirect(result) && result.location).toBe('/keeper/events');

		expect(await db.select().from(event).where(eq(event.id, id))).toEqual([]);
		// Both survive, unlinked; the set keeps its photographs.
		const [linkedArtefact] = await db.select().from(artefact).where(eq(artefact.id, artefactId));
		expect(linkedArtefact).toMatchObject({ eventId: null, updatedBy: ADMIN.id });
		const [set] = await db.select().from(imageSet).where(eq(imageSet.id, setId));
		expect(set).toMatchObject({ eventId: null, updatedBy: ADMIN.id });
		expect(await db.select().from(image).where(eq(image.setId, setId))).toHaveLength(1);
	});

	it('refuses anyone but an admin', async () => {
		const [{ id }] = await db
			.insert(event)
			.values({ title: 'Kept', date: '2024-07-01' })
			.returning({ id: event.id });
		const result = await deleteEvent(id, KEEPER);
		expect(isActionFailure(result) && result.status).toBe(403);
		expect(await db.select().from(event).where(eq(event.id, id))).toHaveLength(1);
	});
});

const { eventFeatureImage } = await import('#lib/server/db/schema.ts');

async function updateEvent(id: number, as: typeof ADMIN, fields: Record<string, string>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const request = {
		params: { id: String(id) },
		locals: { user: as },
		request: new Request('http://localhost/', { method: 'POST', body })
	};
	try {
		// The action reads only these fields of the RequestEvent.
		return await actions.updateEvent(request as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

describe('updateEvent feature image', () => {
	const fields = { title: 'Renamed', date: '2024-08-01' };

	async function setup() {
		const [{ id }] = await db
			.insert(event)
			.values({ title: 'Lantern Walk', date: '2024-08-01' })
			.returning({ id: event.id });
		const url = 'https://bucket.test/submissions/lantern.webp';
		const [{ id: artefactId }] = await db
			.insert(artefact)
			.values({ artefact: 'Lantern map', date: '2024', fileUrls: [url] })
			.returning({ id: artefact.id });
		return { id, artefactId, url };
	}

	const featureOf = async (id: number) =>
		db.select().from(eventFeatureImage).where(eq(eventFeatureImage.eventId, id));

	it('saves the chosen image with the rest of the event', async () => {
		const { id, artefactId, url } = await setup();
		const result = await updateEvent(id, ADMIN, {
			...fields,
			featureImage: `artefact:${artefactId}:${url}`
		});
		expect(isRedirect(result) && result.location).toBe(`/keeper/events/${id}`);
		expect(await featureOf(id)).toEqual([
			expect.objectContaining({ artefactId, artefactFileUrl: url, updatedBy: ADMIN.id })
		]);

		// An empty field clears it again.
		await updateEvent(id, ADMIN, { ...fields, featureImage: '' });
		expect(await featureOf(id)).toEqual([]);
	});

	it('refuses an image that is not there, and saves none of the edit', async () => {
		const { id, artefactId } = await setup();
		for (const featureImage of [
			`artefact:${artefactId}:https://bucket.test/submissions/gone.webp`,
			'image:999999',
			'not a ref'
		]) {
			const result = await updateEvent(id, ADMIN, { ...fields, featureImage });
			expect(isActionFailure(result) && result.status, featureImage).toBe(400);
			expect(isActionFailure(result) && result.data).toMatchObject({
				errors: { featureImage: [expect.any(String)] },
				values: { featureImage }
			});
		}
		const [row] = await db.select().from(event).where(eq(event.id, id));
		expect(row.title).toBe('Lantern Walk');
		expect(await featureOf(id)).toEqual([]);
	});

	it('leaves the choice alone when the form has no feature image field', async () => {
		const { id, artefactId, url } = await setup();
		await updateEvent(id, ADMIN, { ...fields, featureImage: `artefact:${artefactId}:${url}` });
		await updateEvent(id, ADMIN, fields);
		expect(await featureOf(id)).toHaveLength(1);
	});
});
