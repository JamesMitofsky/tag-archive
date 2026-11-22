import { beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./db/testing');
	useTestDatabaseUrl();
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());

const { client, db } = await import('./db/index');
const { migrateTestDatabase } = await import('./db/testing');
const { image, imageSet, EMBEDDING_DIMENSIONS } = await import('./db/schema');
const {
	EMBEDDING_VERSION,
	EmbeddingError,
	embedImage,
	embedPending,
	embedQuery,
	pendingImages,
	scoreImages,
	selectMatches,
	storeEmbedding,
	vectorBytes
} = await import('./imageEmbeddings');

const config = { accountId: 'acct-1', token: 'tok-1' };

/** A unit vector along `axis`, the simplest thing with a known cosine to every other. */
function axis(i: number, weight = 1): Float32Array {
	const v = new Float32Array(EMBEDDING_DIMENSIONS);
	v[i] = weight;
	return v;
}

/** Workers AI's REST envelope around one embedding. */
function answer(vector: ArrayLike<number>): Response {
	return Response.json({
		success: true,
		errors: [],
		result: { object: 'list', data: [{ object: 'embedding', index: 0, embedding: [...vector] }] }
	});
}

function photo(id: number, setId: number | null) {
	return {
		id,
		setId,
		url: `https://bucket.test/images/${id}/display.webp`,
		originalUrl: `https://bucket.test/images/${id}/original.jpg`,
		originalType: 'image/jpeg' as const,
		originalBytes: 1000,
		bytes: 100,
		width: 4,
		height: 3
	};
}

async function vectorRows() {
	const { rows } = await client.execute(
		'SELECT image_id, model, length(vector) AS bytes FROM image_embedding ORDER BY image_id'
	);
	return rows.map((r) => ({
		id: Number(r.image_id),
		model: String(r.model),
		bytes: Number(r.bytes)
	}));
}

beforeEach(async () => {
	await migrateTestDatabase();
	await client.execute('DELETE FROM image_embedding');
	await db.delete(image);
	await db.delete(imageSet);
	await db.insert(imageSet).values([
		{ id: 1, description: 'vetted' },
		{ id: 2, description: 'in review', proposedAddition: true }
	]);
	await db
		.insert(image)
		.values([photo(1, 1), photo(2, 1), photo(3, 1), photo(4, 2), photo(5, null)]);
});

describe('embedQuery and embedImage', () => {
	it('asks Workers AI for a query with the model’s query instruction', async () => {
		const fetchFn = vi.fn(async () => answer(axis(0)));
		const vector = await embedQuery(config, '  red flowers ', fetchFn as never);
		expect(vector).toEqual(axis(0));
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(
			'https://api.cloudflare.com/client/v4/accounts/acct-1/ai/run/@cf/google/embeddinggemma-2'
		);
		expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok-1');
		expect(JSON.parse(String(init.body))).toEqual({
			input: 'task: search result | query: red flowers',
			dimensions: EMBEDDING_DIMENSIONS,
			encoding_format: 'float'
		});
	});

	it('sends a photograph as a WebP data URI', async () => {
		const fetchFn = vi.fn(async () => answer(axis(1)));
		await embedImage(config, new Uint8Array([1, 2, 3]), 'image/webp', fetchFn as never);
		const body = JSON.parse(
			String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body)
		);
		expect(body.messages).toEqual([
			{
				role: 'user',
				content: [{ type: 'image_url', image_url: { url: 'data:image/webp;base64,AQID' } }]
			}
		]);
	});

	it('refuses a failed call and an answer that is not an embedding of the right size', async () => {
		const failing = vi.fn(async () => new Response('{"success":false}', { status: 403 }));
		await expect(embedQuery(config, 'fire', failing as never)).rejects.toThrow(/403/);
		const short = vi.fn(async () => answer([0.1, 0.2]));
		await expect(embedQuery(config, 'fire', short as never)).rejects.toThrow(EmbeddingError);
		const notJson = vi.fn(async () => new Response('<html>', { status: 200 }));
		await expect(embedQuery(config, 'fire', notJson as never)).rejects.toThrow(EmbeddingError);
	});

	it('refuses an empty query without calling anyone', async () => {
		const fetchFn = vi.fn();
		await expect(embedQuery(config, '   ', fetchFn as never)).rejects.toThrow(EmbeddingError);
		expect(fetchFn).not.toHaveBeenCalled();
	});
});

describe('storing and scoring vectors', () => {
	it('refuses a vector of the wrong size, which libSQL would store regardless', () => {
		expect(() => vectorBytes(new Float32Array(3))).toThrow(EmbeddingError);
		expect(vectorBytes(axis(0)).byteLength).toBe(EMBEDDING_DIMENSIONS * 4);
	});

	it('never replaces a current vector, replaces a stale one, and skips a photograph that is gone', async () => {
		await storeEmbedding(client, 1, axis(0));
		await storeEmbedding(client, 1, axis(1));
		await client.execute({
			sql: 'INSERT INTO image_embedding (image_id, model, vector) VALUES (2, ?, ?)',
			args: ['some-old-model@512', vectorBytes(axis(5))]
		});
		await storeEmbedding(client, 2, axis(1));
		await storeEmbedding(client, 99, axis(0));

		expect(await vectorRows()).toEqual([
			{ id: 1, model: EMBEDDING_VERSION, bytes: EMBEDDING_DIMENSIONS * 4 },
			{ id: 2, model: EMBEDDING_VERSION, bytes: EMBEDDING_DIMENSIONS * 4 }
		]);
		// The first answer for photograph 1 stood.
		const [best] = await scoreImages(client, axis(0));
		expect(best).toEqual({ id: 1, score: expect.closeTo(1, 5) });
	});

	it('scores only current vectors of vetted sets, best first', async () => {
		await storeEmbedding(client, 1, axis(0));
		await storeEmbedding(client, 2, axis(1));
		const tilted = axis(0, 0.6);
		tilted[1] = 0.8;
		await storeEmbedding(client, 3, tilted);
		// In review: never answered.
		await storeEmbedding(client, 4, axis(0));

		const scored = await scoreImages(client, axis(0));
		expect(scored.map((s) => s.id)).toEqual([1, 3, 2]);
		expect(scored[1].score).toBeCloseTo(0.6, 5);
		expect(scored[2].score).toBeCloseTo(0, 5);
	});

	it('lets a photograph’s vector go with it', async () => {
		await storeEmbedding(client, 1, axis(0));
		await db.delete(imageSet);
		expect(await vectorRows()).toEqual([]);
	});
});

describe('embedPending', () => {
	it('waits on photographs in a set with no vector or a stale one, newest first', async () => {
		await storeEmbedding(client, 3, axis(0));
		await client.execute({
			sql: 'INSERT INTO image_embedding (image_id, model, vector) VALUES (2, ?, ?)',
			args: ['some-old-model@768', vectorBytes(axis(0))]
		});
		// 5 is unattached, 3 is current.
		expect((await pendingImages(client, 10)).map((p) => p.id)).toEqual([4, 2, 1]);
	});

	it('embeds everything waiting, carrying on past one that fails', async () => {
		const read = vi.fn(async (url: string) => (url.includes('/2/') ? null : new Uint8Array([7])));
		const fetchFn = vi.fn(async () => answer(axis(0)));
		const run = await embedPending({
			client,
			config,
			read,
			budgetMs: 60_000,
			batch: 2,
			fetchFn: fetchFn as never
		});
		expect(run).toEqual({ embedded: 3, failed: 1, remaining: false });
		expect((await vectorRows()).map((r) => r.id)).toEqual([1, 3, 4]);
		// The one it couldn't read was tried once, not once a round.
		expect(read.mock.calls.filter(([url]) => url.includes('/2/'))).toHaveLength(1);
	});

	it('stores nothing on a dry run, and still finishes', async () => {
		const fetchFn = vi.fn(async () => answer(axis(0)));
		const run = await embedPending({
			client,
			config,
			read: async () => new Uint8Array([7]),
			budgetMs: 60_000,
			batch: 2,
			fetchFn: fetchFn as never,
			dryRun: true
		});
		expect(run).toEqual({ embedded: 4, failed: 0, remaining: false });
		expect(await vectorRows()).toEqual([]);
	});

	it('stops when its budget is spent, saying there is more', async () => {
		const run = await embedPending({
			client,
			config,
			read: async () => new Uint8Array([7]),
			budgetMs: 0,
			fetchFn: vi.fn() as never
		});
		expect(run).toEqual({ embedded: 0, failed: 0, remaining: true });
	});
});

describe('selectMatches', () => {
	const rule = { minScore: 0.2, minZ: 1.5, maxGap: 0.1, maxResults: 3 };
	const scored = (...scores: number[]) => scores.map((score, i) => ({ id: i + 1, score }));

	it('keeps what stands out from the archive and sits near the best', () => {
		const archive = scored(0.45, 0.44, 0.43, 0.3, 0.29, 0.28, 0.27, 0.26, 0.25, 0.24, 0.23, 0.22);
		expect(selectMatches(archive, rule).map((s) => s.id)).toEqual([1, 2, 3]);
	});

	it('finds nothing when nothing is near in absolute terms', () => {
		const archive = scored(0.15, 0.05, 0.04, 0.04, 0.03, 0.03, 0.02, 0.02, 0.01);
		expect(selectMatches(archive, rule)).toEqual([]);
	});

	it('keeps only the standouts when the whole archive sits near the query', () => {
		// The gap alone would let 0.36 and 0.35 in; they are the archive's norm.
		const archive = scored(0.45, 0.44, 0.36, 0.35, 0.34, 0.33, 0.33, 0.32, 0.32, 0.31, 0.31, 0.3);
		expect(selectMatches(archive, rule).map((s) => s.id)).toEqual([1, 2]);
	});

	it('caps the answer, and leans on the floor and the gap alone for a tiny archive', () => {
		expect(selectMatches(scored(0.5, 0.45, 0.44, 0.43, 0.2), rule).map((s) => s.id)).toEqual([
			1, 2, 3
		]);
		expect(selectMatches([], rule)).toEqual([]);
	});
});
