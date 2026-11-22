import { beforeEach, describe, expect, it, vi } from 'vitest';

// What a query finds is #lib/server/imageEmbeddings.spec.ts's; here, only the
// endpoint around it.
const searchByContent = vi.hoisted(() => vi.fn());
vi.mock('#lib/server/contentSearch.ts', () => ({ searchByContent }));

const { GET } = await import('./+server');

async function call(q?: string) {
	const url = new URL('http://localhost/api/images/search');
	if (q !== undefined) url.searchParams.set('q', q);
	try {
		return { response: await GET({ url } as never) };
	} catch (thrown) {
		return { thrown: thrown as { status?: number } };
	}
}

beforeEach(() => {
	searchByContent.mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/images/search', () => {
	it('answers the matches, cached under the archive tag', async () => {
		searchByContent.mockResolvedValue([{ id: 7, score: 0.4 }]);
		const { response } = await call('red flowers');
		expect(searchByContent).toHaveBeenCalledWith('red flowers');
		expect(await response?.json()).toEqual([{ id: 7, score: 0.4 }]);
		expect(response?.headers.get('vercel-cache-tag')).toBe('archive');
	});

	it('refuses a missing, overlong or unnormalized query without searching', async () => {
		for (const q of [undefined, '', 'x'.repeat(201), 'Flowers', ' flowers', 'red  flowers']) {
			expect((await call(q)).thrown?.status).toBe(400);
		}
		expect(searchByContent).not.toHaveBeenCalled();
	});

	it('answers 502, uncached, when the search fails', async () => {
		searchByContent.mockRejectedValue(new Error('Workers AI answered 500'));
		expect((await call('fire')).thrown?.status).toBe(502);
	});
});
