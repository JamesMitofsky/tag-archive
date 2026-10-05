import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./db/testing');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const { migrateTestDatabase } = await import('./db/testing');
const { consume, pruneRateLimits } = await import('./rateLimit');
const { db } = await import('./db');
const { rateLimit } = await import('./db/schema');

beforeAll(migrateTestDatabase);

const limit = { limit: 3, windowMs: 1000 };

describe('consume', () => {
	it('allows up to the limit within one window, then refuses', async () => {
		const results = [];
		for (let i = 0; i < 4; i++) results.push(await consume('t1', 'ip-a', limit, 10_000));
		expect(results).toEqual([true, true, true, false]);
	});

	it('starts over in the next window', async () => {
		for (let i = 0; i < 4; i++) await consume('t2', 'ip-a', limit, 20_000);
		expect(await consume('t2', 'ip-a', limit, 21_000)).toBe(true);
	});

	it('counts subjects and buckets separately', async () => {
		for (let i = 0; i < 4; i++) await consume('t3', 'ip-a', limit, 30_000);
		expect(await consume('t3', 'ip-b', limit, 30_000)).toBe(true);
		expect(await consume('t3-other', 'ip-a', limit, 30_000)).toBe(true);
	});

	it('stores subjects hashed, never the raw address', async () => {
		await consume('t4', '203.0.113.7', limit, 40_000);
		const keys = (await db.select({ key: rateLimit.key }).from(rateLimit)).map((r) => r.key);
		expect(keys.some((key) => key.includes('203.0.113.7'))).toBe(false);
	});

	it('counts concurrent requests exactly', async () => {
		const results = await Promise.all(
			Array.from({ length: 10 }, () => consume('t5', 'ip-a', { limit: 5, windowMs: 1000 }, 50_000))
		);
		expect(results.filter(Boolean)).toHaveLength(5);
	});
});

describe('pruneRateLimits', () => {
	it('drops counters whose window is older than the cut-off', async () => {
		await consume('t6', 'ip-a', limit, 100);
		await consume('t6', 'ip-b', limit, 1_000_000);
		await pruneRateLimits(10_000, 1_000_000);
		const left = await db.select({ windowStart: rateLimit.windowStart }).from(rateLimit);
		expect(left.every((r) => r.windowStart >= 990_000)).toBe(true);
	});
});
