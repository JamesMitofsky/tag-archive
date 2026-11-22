import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ CRON_SECRET: 'test-cron-secret' as string | undefined }));
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv(env));

// The steps themselves are covered in #lib/server/uploads.spec.ts; here they
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
vi.mock('#lib/server/uploads.ts', () => sweeps);
vi.mock('#lib/server/rateLimit.ts', () => ({ pruneRateLimits }));
type CatchUp = { embedded: number; failed: number; remaining: boolean };
const embedMissing = vi.hoisted(() => vi.fn<(budgetMs: number) => Promise<CatchUp | null>>());
const purgeArchiveCache = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('#lib/server/contentSearch.ts', () => ({ embedMissing }));
vi.mock('#lib/server/cache.ts', () => ({ purgeArchiveCache }));
vi.mock('#lib/server/imageUploads.ts', () => ({ readDisplayCopy: vi.fn() }));

const { GET } = await import('./+server');
const BEARER = 'Bearer test-cron-secret';

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
		return { response: await GET(event as never) };
	} catch (thrown) {
		return { thrown: thrown as { status?: number } };
	}
}

beforeEach(() => {
	calls.length = 0;
	env.CRON_SECRET = 'test-cron-secret';
	vi.spyOn(console, 'error').mockImplementation(() => {});
	pruneRateLimits.mockImplementation(recorded('counters', 4));
	sweeps.sweepUnattachedImages.mockImplementation(recorded('unattachedImages', 1));
	sweeps.sweepAbandonedSubmissions.mockImplementation(recorded('images', 2));
	sweeps.sweepOrphanObjects.mockImplementation(recorded('orphanObjects', 3));
	embedMissing.mockImplementation(async () => {
		calls.push('embeddings');
		return { embedded: 5, failed: 0, remaining: false };
	});
	purgeArchiveCache.mockClear();
});

describe('GET /api/cron/sweep-submissions', () => {
	it('refuses a caller without the cron bearer, running nothing', async () => {
		for (const authorization of [undefined, 'Bearer nope', `${BEARER}x`, 'test-cron-secret']) {
			const { thrown } = await call(authorization);
			expect(thrown?.status).toBe(401);
		}
		expect(calls).toEqual([]);
	});

	it('refuses everyone while CRON_SECRET is unset, even an empty bearer', async () => {
		env.CRON_SECRET = undefined;
		for (const authorization of [undefined, 'Bearer ', 'Bearer undefined']) {
			const { thrown } = await call(authorization);
			expect(thrown?.status).toBe(401);
		}
		expect(calls).toEqual([]);
	});

	it('runs every step, unattached rows before the object sweeps, and reports each count', async () => {
		const { response } = await call(BEARER);
		expect(response?.status).toBe(200);
		expect(await response?.json()).toEqual({
			images: 2,
			unattachedImages: 1,
			orphanObjects: 3,
			counters: 4,
			embeddings: 5
		});
		expect(calls).toEqual([
			'counters',
			'unattachedImages',
			'images',
			'orphanObjects',
			'embeddings'
		]);
		// New vectors change what a cached search would answer.
		expect(purgeArchiveCache).toHaveBeenCalledOnce();
	});

	it('keeps going past a failing step, reporting it as null with a 500', async () => {
		sweeps.sweepUnattachedImages.mockRejectedValueOnce(new Error('database is locked'));
		const { response } = await call(BEARER);
		expect(response?.status).toBe(500);
		expect(await response?.json()).toEqual({
			images: 2,
			unattachedImages: null,
			orphanObjects: 3,
			counters: 4,
			embeddings: 5
		});
		expect(calls).toEqual(['counters', 'images', 'orphanObjects', 'embeddings']);
	});

	it('gives the embedding catch-up what is left of the run', async () => {
		await call(BEARER);
		const [budget] = embedMissing.mock.calls[0];
		expect(budget).toBeGreaterThan(200_000);
		expect(budget).toBeLessThanOrEqual(240_000);
	});

	it('reports photographs it could not embed without failing the run', async () => {
		embedMissing.mockResolvedValueOnce({ embedded: 0, failed: 2, remaining: false });
		const { response } = await call(BEARER);
		expect(response?.status).toBe(200);
		expect(await response?.json()).toMatchObject({ embeddings: 0 });
		// Nothing new to show, so nothing to refresh.
		expect(purgeArchiveCache).not.toHaveBeenCalled();
	});

	it('embeds nothing, and still succeeds, when content search is not set up', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		embedMissing.mockResolvedValueOnce(null);
		const { response } = await call(BEARER);
		expect(response?.status).toBe(200);
		expect(await response?.json()).toMatchObject({ embeddings: 0 });
	});
});
