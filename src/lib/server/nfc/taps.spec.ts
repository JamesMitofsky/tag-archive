import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('../db/testing');
	useTestDatabaseUrl();
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const { migrateTestDatabase } = await import('../db/testing');
const { recordTap } = await import('./taps');
const { db } = await import('../db');
const { nfcTag } = await import('../db/schema');
const { eq } = await import('drizzle-orm');

beforeAll(migrateTestDatabase);

describe('recordTap', () => {
	it('registers a tag on its first tap', async () => {
		expect(await recordTap('04000000000001', 5)).toBe('ok');
		const row = await db.select().from(nfcTag).where(eq(nfcTag.uid, '04000000000001')).get();
		expect(row?.lastCounter).toBe(5);
	});

	it('accepts any higher counter, gaps and all', async () => {
		await recordTap('04000000000002', 5);
		expect(await recordTap('04000000000002', 6)).toBe('ok');
		expect(await recordTap('04000000000002', 40)).toBe('ok');
	});

	it('refuses a counter already seen, or an older one', async () => {
		await recordTap('04000000000003', 10);
		expect(await recordTap('04000000000003', 10)).toBe('used');
		expect(await recordTap('04000000000003', 9)).toBe('used');
		// A refused replay must not move the high-water mark.
		expect(await recordTap('04000000000003', 11)).toBe('ok');
	});

	it('refuses every tap from a revoked tag', async () => {
		await recordTap('04000000000004', 1);
		await db.update(nfcTag).set({ revokedAt: new Date() }).where(eq(nfcTag.uid, '04000000000004'));
		expect(await recordTap('04000000000004', 2)).toBe('revoked');
	});

	it('accepts only one of two concurrent identical taps', async () => {
		await recordTap('04000000000005', 1);
		const outcomes = await Promise.all([
			recordTap('04000000000005', 2),
			recordTap('04000000000005', 2)
		]);
		expect(outcomes.sort()).toEqual(['ok', 'used']);
	});
});
