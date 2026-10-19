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
const { artefact, event, image, imageSet, user } = await import('$lib/server/db/schema');
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
