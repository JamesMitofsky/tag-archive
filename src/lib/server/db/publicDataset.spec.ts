import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./testing');
	useTestDatabaseUrl();
});
// SvelteKit only populates $env/dynamic/private inside a running server.
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const { db } = await import('./index');
const { migrateTestDatabase } = await import('./testing');
const { loadPublicDataset } = await import('./queries');
const { artefact, artefactProvenance, event, eventHost, person } = await import('./schema');

beforeAll(async () => {
	await migrateTestDatabase();

	await db.insert(event).values([
		{ id: 1, title: 'Vetted Concert', date: '2024-06-01' },
		{ id: 2, title: 'Pending Picnic', date: '2024-07-01', proposedAddition: true }
	]);
	await db.insert(artefact).values([
		{ id: 1, artefact: 'Vetted program', date: '2024', eventId: 1 },
		{ id: 2, artefact: 'Pending flyer', date: '2024', proposedAddition: true },
		// Vetted itself, but linked to an event nobody has reviewed yet.
		{ id: 3, artefact: 'Vetted photo', date: '2024-07', eventId: 2 }
	]);
	await db.insert(person).values([
		{ id: 1, name: 'Vetted Contributor' },
		{ id: 2, name: 'Pending Contributor' },
		{ id: 3, name: 'Vetted Host' },
		{ id: 4, name: 'Pending Host' },
		{ id: 5, name: 'Orphan' }
	]);
	await db.insert(artefactProvenance).values([
		{ artefactId: 1, personId: 1 },
		{ artefactId: 2, personId: 2 }
	]);
	await db.insert(eventHost).values([
		{ eventId: 1, personId: 3 },
		{ eventId: 2, personId: 4 }
	]);
});

describe('loadPublicDataset', () => {
	it('publishes vetted artefacts only', async () => {
		const { artefacts } = await loadPublicDataset();
		expect(artefacts.map((a) => a.artefact).sort()).toEqual(['Vetted photo', 'Vetted program']);
	});

	it('publishes vetted events only', async () => {
		const { events } = await loadPublicDataset();
		expect(events.map((e) => e.title)).toEqual(['Vetted Concert']);
		expect(events[0].hosts).toEqual(['Vetted Host']);
	});

	it("hides a pending event's title on a vetted artefact", async () => {
		const { artefacts } = await loadPublicDataset();
		const byTitle = new Map(artefacts.map((a) => [a.artefact, a]));
		expect(byTitle.get('Vetted program')?.event).toBe('Vetted Concert');
		expect(byTitle.get('Vetted photo')?.event).toBeNull();
	});

	it('lists only people linked to something vetted', async () => {
		const { people } = await loadPublicDataset();
		expect(people.sort()).toEqual(['Vetted Contributor', 'Vetted Host']);
	});
});
