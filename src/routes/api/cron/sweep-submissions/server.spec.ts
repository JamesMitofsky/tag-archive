import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { BETTER_AUTH_SECRET: 'test-secret' } }));

// The steps themselves are covered in $lib/server/uploads.spec.ts; here they
// only record that, and in what order, the route runs them.
const calls: string[] = [];
const recorded = (name: string, result: number) =>
	vi.fn(async () => {
		calls.push(name);
		return result;
	});
const sweeps = vi.hoisted(() => ({
	sweepUnattachedImages: vi.fn<() => Promise<number>>(),
	sweepAbandonedSubmissions: vi.fn<() => Promise<number>>(),
	sweepOrphanObjects: vi.fn<() => Promise<number>>()
}));
const pruneRateLimits = vi.hoisted(() => vi.fn<(olderThanMs: number) => Promise<number>>());
vi.mock('$lib/server/uploads', () => sweeps);
vi.mock('$lib/server/rateLimit', () => ({ pruneRateLimits }));

const { cronToken } = await import('$lib/server/signing');
const { POST } = await import('./+server');

async function call(authorization?: string) {
	const headers = authorization ? { authorization } : undefined;
	const event = {
		request: new Request('http://localhost/api/cron/sweep-submissions', {
			method: 'POST',
			headers
		})
	};
	try {
		// The handler reads only the request.
		return { response: await POST(event as never) };
	} catch (thrown) {
		return { thrown: thrown as { status?: number } };
	}
}

beforeEach(() => {
	calls.length = 0;
	vi.spyOn(console, 'error').mockImplementation(() => {});
	pruneRateLimits.mockImplementation(recorded('counters', 4));
	sweeps.sweepUnattachedImages.mockImplementation(recorded('unattachedImages', 1));
	sweeps.sweepAbandonedSubmissions.mockImplementation(recorded('images', 2));
	sweeps.sweepOrphanObjects.mockImplementation(recorded('orphanObjects', 3));
});

describe('POST /api/cron/sweep-submissions', () => {
	it('refuses a caller without the cron bearer, running nothing', async () => {
		for (const authorization of [undefined, 'Bearer nope', `Bearer ${cronToken()}x`]) {
			const { thrown } = await call(authorization);
			expect(thrown?.status).toBe(401);
		}
		expect(calls).toEqual([]);
	});

	it('runs every step, unattached rows before the object sweeps, and reports each count', async () => {
		const { response } = await call(`Bearer ${cronToken()}`);
		expect(response?.status).toBe(200);
		expect(await response?.json()).toEqual({
			images: 2,
			unattachedImages: 1,
			orphanObjects: 3,
			counters: 4
		});
		expect(calls).toEqual(['counters', 'unattachedImages', 'images', 'orphanObjects']);
	});

	it('keeps going past a failing step, reporting it as null with a 500', async () => {
		sweeps.sweepUnattachedImages.mockRejectedValueOnce(new Error('database is locked'));
		const { response } = await call(`Bearer ${cronToken()}`);
		expect(response?.status).toBe(500);
		expect(await response?.json()).toEqual({
			images: 2,
			unattachedImages: null,
			orphanObjects: 3,
			counters: 4
		});
		expect(calls).toEqual(['counters', 'images', 'orphanObjects']);
	});
});
