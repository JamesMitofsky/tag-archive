import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./testing');
	useTestDatabaseUrl();
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
// Record storage deletes instead of calling R2.
const deleteScan = vi.hoisted(() => vi.fn(async (_key: string) => {}));
vi.mock('../scans', async (importOriginal) => ({
	...(await importOriginal<typeof import('../scans')>()),
	deleteScan
}));

const { migrateTestDatabase } = await import('./testing');
const { db } = await import('./index');
const { rejectProposed } = await import('./queries');
const { artefact, artefactProvenance, person } = await import('./schema');

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(artefact).values([
		{
			id: 1,
			artefact: 'Rejected flyer',
			date: '2024',
			proposedAddition: true,
			fileUrls: [
				'https://bucket.test/submissions/d1/only-mine.webp',
				'https://bucket.test/submissions/d1/shared.webp',
				'/artefacts/legacy.jpg'
			]
		},
		{
			id: 2,
			artefact: 'Vetted program',
			date: '2024',
			fileUrls: ['https://bucket.test/submissions/d1/shared.webp']
		}
	]);
	await db.insert(person).values([
		{ id: 1, name: 'Only on the rejected one' },
		{ id: 2, name: 'Also on a vetted one' }
	]);
	await db.insert(artefactProvenance).values([
		{ artefactId: 1, personId: 1 },
		{ artefactId: 1, personId: 2 },
		{ artefactId: 2, personId: 2 }
	]);

	await rejectProposed('artefact', 1, 'admin');
});

describe('rejecting a proposed artefact', () => {
	it('removes the artefact', async () => {
		expect(await db.select().from(artefact).where(eq(artefact.id, 1))).toHaveLength(0);
	});

	it('deletes only the images nothing else uses, and never one that is not ours', () => {
		expect(deleteScan.mock.calls.map(([key]) => key)).toEqual(['submissions/d1/only-mine.webp']);
	});

	it('deletes the names it introduced, but keeps people still linked elsewhere', async () => {
		const names = (await db.select({ name: person.name }).from(person)).map((p) => p.name);
		expect(names).toEqual(['Also on a vetted one']);
	});
});
