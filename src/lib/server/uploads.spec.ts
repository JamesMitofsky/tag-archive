import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./db/testing');
	useTestDatabaseUrl();
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const NOW = Date.parse('2026-10-02T12:00:00Z');
const HOURS = 60 * 60 * 1000;
const deleteScan = vi.hoisted(() => vi.fn(async (_key: string) => {}));
const listScans = vi.hoisted(() => vi.fn());
vi.mock('./scans', async (importOriginal) => ({
	...(await importOriginal<typeof import('./scans')>()),
	deleteScan,
	listScans
}));

const { migrateTestDatabase } = await import('./db/testing');
const { db } = await import('./db');
const { artefact } = await import('./db/schema');
const { sweepAbandonedSubmissions } = await import('./uploads');

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(artefact).values({
		artefact: 'Submitted',
		date: '2024',
		proposedAddition: true,
		fileUrls: ['https://bucket.test/submissions/d1/used.webp']
	});
	listScans.mockResolvedValue([
		{ key: 'submissions/d1/used.webp', lastModified: new Date(NOW - 48 * HOURS) },
		{ key: 'submissions/d1/abandoned.webp', lastModified: new Date(NOW - 48 * HOURS) },
		{ key: 'submissions/d2/in-progress.webp', lastModified: new Date(NOW - 2 * HOURS) }
	]);
});

describe('sweepAbandonedSubmissions', () => {
	it('deletes only old uploads that no artefact uses', async () => {
		expect(await sweepAbandonedSubmissions(NOW)).toBe(1);
		expect(listScans).toHaveBeenCalledWith('submissions/');
		expect(deleteScan.mock.calls.map(([key]) => key)).toEqual(['submissions/d1/abandoned.webp']);
	});
});
