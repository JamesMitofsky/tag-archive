/**
 * Content search for photographs: each photograph is embedded once, by a model
 * that puts images and text in one vector space, and a query ("flower",
 * "painting") is embedded the same way and compared with every photograph.
 * Nearness in that space is what makes a photograph of roses answer "flower"
 * when no one ever typed the word.
 *
 * The model is Google's EmbeddingGemma 2 on Cloudflare Workers AI, called over
 * Cloudflare's REST API. Cloudflare already holds every photograph (R2), so
 * embedding hands no photograph to anyone new. The call is made in this one
 * module, and every stored vector records the model that made it, so moving
 * to another model is a re-embed, never a guess about which vectors are whose.
 *
 * Free of `$app/*` imports, so scripts/backfill-embeddings.ts can drive the
 * same code with its own database client and configuration. The app's wiring
 * is #lib/server/contentSearch.
 */
import type { Client } from '@libsql/client';
import { EMBEDDING_DIMENSIONS } from './db/schema';

/** The Workers AI model every vector comes from. */
export const EMBEDDING_MODEL = '@cf/google/embeddinggemma-2';

/**
 * What `image_embedding.model` records: the model and the vector size asked
 * of it, since a Matryoshka model's 512 is not its 768 cut short in a way a
 * query of the other size could be compared with.
 */
export const EMBEDDING_VERSION = `${EMBEDDING_MODEL}@${EMBEDDING_DIMENSIONS}`;

/** Longest query embedded, in characters: a search, not a document. */
export const MAX_QUERY_LENGTH = 200;

/** A Cloudflare account and an API token allowed to run Workers AI there. */
export type EmbeddingConfig = { accountId: string; token: string };

/** The `fetch` the provider is called through, so a spec can stand in for it. */
export type Fetch = typeof fetch;

/** How long one call to Workers AI may take before it is abandoned. */
const CALL_TIMEOUT_MS = 30_000;

/** A Workers AI call failed, or answered with something that isn't an embedding. */
export class EmbeddingError extends Error {
	override name = 'EmbeddingError';
}

/**
 * Run the model once and return the one embedding it makes. Cloudflare's REST
 * envelope is `{ success, errors, result }`, and the model's own answer (an
 * OpenAI-style list of embeddings) is the `result`.
 */
async function run(config: EmbeddingConfig, body: object, fetchFn: Fetch): Promise<Float32Array> {
	const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/ai/run/${EMBEDDING_MODEL}`;
	const res = await fetchFn(url, {
		method: 'POST',
		headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ ...body, dimensions: EMBEDDING_DIMENSIONS, encoding_format: 'float' }),
		signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
	});
	const text = await res.text();
	if (!res.ok) throw new EmbeddingError(`Workers AI answered ${res.status}: ${text.slice(0, 500)}`);
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new EmbeddingError(`Workers AI answered with something other than JSON`);
	}
	const embedding = (parsed as { result?: { data?: { embedding?: unknown }[] } })?.result?.data?.[0]
		?.embedding;
	if (
		!Array.isArray(embedding) ||
		embedding.length !== EMBEDDING_DIMENSIONS ||
		!embedding.every((v) => typeof v === 'number' && Number.isFinite(v))
	) {
		throw new EmbeddingError(
			`Workers AI answered without a ${EMBEDDING_DIMENSIONS}-number embedding`
		);
	}
	return Float32Array.from(embedding as number[]);
}

/**
 * A search query's embedding. The prefix is the model's own instruction for a
 * query that looks for matching documents (here, photographs); without it the
 * model embeds the words as a document of their own.
 */
export async function embedQuery(
	config: EmbeddingConfig,
	query: string,
	fetchFn: Fetch = fetch
): Promise<Float32Array> {
	const text = query.trim().slice(0, MAX_QUERY_LENGTH);
	if (!text) throw new EmbeddingError('Nothing to embed');
	return run(config, { input: `task: search result | query: ${text}` }, fetchFn);
}

/** A photograph's embedding, from its display copy (a WebP). */
export async function embedImage(
	config: EmbeddingConfig,
	bytes: Uint8Array,
	type = 'image/webp',
	fetchFn: Fetch = fetch
): Promise<Float32Array> {
	const url = `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
	return run(
		config,
		{ messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url } }] }] },
		fetchFn
	);
}

/**
 * A vector as the column stores it: little-endian float32s. Refuses one of the
 * wrong length, which libSQL itself would store without a murmur and then
 * fail to compare.
 */
export function vectorBytes(vector: Float32Array): Uint8Array {
	if (vector.length !== EMBEDDING_DIMENSIONS) {
		throw new EmbeddingError(`Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${vector.length}`);
	}
	// Float32Array is in the platform's byte order; every platform this runs on
	// is little-endian, but say so rather than lean on it.
	const view = new DataView(new ArrayBuffer(vector.length * 4));
	vector.forEach((v, i) => view.setFloat32(i * 4, v, true));
	return new Uint8Array(view.buffer);
}

/**
 * Store a photograph's vector. Never replaces a vector the current model made,
 * so a catch-up that read a photograph before its upload hook finished can't
 * write over the hook's answer with its own (the same answer, but the rule is
 * simpler than the reasoning). A stale-model vector is replaced. A photograph
 * deleted meanwhile is skipped: the insert reads it back from `image`, so the
 * foreign key never fires.
 *
 * Written straight through the client, not drizzle: a derived vector is not
 * an edit anyone made, and touches no audit column.
 */
export async function storeEmbedding(
	client: Client,
	imageId: number,
	vector: Float32Array
): Promise<void> {
	await client.execute({
		sql: `INSERT INTO image_embedding (image_id, model, vector)
			SELECT id, ?, ? FROM image WHERE id = ?
			ON CONFLICT (image_id) DO UPDATE SET
				model = excluded.model,
				vector = excluded.vector,
				created_at = excluded.created_at
			WHERE image_embedding.model <> excluded.model`,
		args: [EMBEDDING_VERSION, vectorBytes(vector), imageId]
	});
}

/** A photograph waiting for a vector: none yet, or one from another model. */
export type PendingImage = { id: number; url: string };

/**
 * The photographs to embed next, newest first, so a backlog serves what was
 * just added before what has waited all along. Only photographs in a set:
 * an unattached upload is either about to be attached (and its upload hook
 * has embedded it) or about to be swept.
 */
export async function pendingImages(client: Client, limit: number): Promise<PendingImage[]> {
	const { rows } = await client.execute({
		sql: `SELECT image.id, image.url FROM image
			LEFT JOIN image_embedding ON image_embedding.image_id = image.id
			WHERE image.set_id IS NOT NULL
				AND (image_embedding.image_id IS NULL OR image_embedding.model <> ?)
			ORDER BY image.id DESC
			LIMIT ?`,
		args: [EMBEDDING_VERSION, limit]
	});
	return rows.map((row) => ({ id: Number(row.id), url: String(row.url) }));
}

/** How a catch-up went: photographs embedded, and photographs that failed. */
export type CatchUp = { embedded: number; failed: number; remaining: boolean };

/**
 * Embed waiting photographs until none are left or `budgetMs` runs out. One
 * that fails (an unreadable display copy, a refused call) is counted and left
 * for the next run, so it can't hold up the rest. Read through `read`, which
 * answers a display copy's bytes, or null when it is gone.
 */
export async function embedPending(options: {
	client: Client;
	config: EmbeddingConfig;
	read: (url: string) => Promise<Uint8Array | null>;
	budgetMs: number;
	/** Photographs fetched per round; also the most a run can attempt past its budget. */
	batch?: number;
	fetchFn?: Fetch;
	onEach?: (image: PendingImage, outcome: 'embedded' | Error) => void;
	/** A dry run: embed, but store nothing. */
	dryRun?: boolean;
}): Promise<CatchUp> {
	const { client, config, read, budgetMs, batch = 8, fetchFn = fetch, onEach, dryRun } = options;
	const deadline = Date.now() + budgetMs;
	// Every photograph tried this run. A failed one stays pending in the table,
	// as does every one a dry run embeds, so each round asks past them: one bad
	// photograph must not come back at the head of every later round.
	const tried = new Set<number>();
	let embedded = 0;
	let failed = 0;
	for (;;) {
		if (Date.now() >= deadline) return { embedded, failed, remaining: true };
		const page = await pendingImages(client, batch + tried.size);
		const todo = page.filter((p) => !tried.has(p.id)).slice(0, batch);
		if (todo.length === 0) return { embedded, failed, remaining: false };
		await Promise.all(
			todo.map(async (image) => {
				tried.add(image.id);
				try {
					const bytes = await read(image.url);
					if (!bytes) throw new EmbeddingError(`No display copy at ${image.url}`);
					const vector = await embedImage(config, bytes, 'image/webp', fetchFn);
					if (!dryRun) await storeEmbedding(client, image.id, vector);
					embedded += 1;
					onEach?.(image, 'embedded');
				} catch (e) {
					failed += 1;
					onEach?.(image, e instanceof Error ? e : new Error(String(e)));
				}
			})
		);
	}
}

/** One photograph's nearness to a query: cosine similarity, -1 to 1. */
export type Scored = { id: number; score: number };

/**
 * Every photograph of a vetted set that the current model has embedded,
 * scored against `query`, best first. Brute force: at the archive's size a
 * scan is a few milliseconds, and it needs no index to keep in step.
 */
export async function scoreImages(client: Client, query: Float32Array): Promise<Scored[]> {
	const { rows } = await client.execute({
		sql: `SELECT image.id, 1 - vector_distance_cos(image_embedding.vector, ?) AS score
			FROM image_embedding
			JOIN image ON image.id = image_embedding.image_id
			JOIN image_set ON image_set.id = image.set_id
			WHERE image_set.proposed_addition = 0 AND image_embedding.model = ?
			ORDER BY score DESC`,
		args: [vectorBytes(query), EMBEDDING_VERSION]
	});
	return rows.map((row) => ({ id: Number(row.id), score: Number(row.score) }));
}

/**
 * How a match is told from the rest. Cosine scores from one model to the next,
 * and even from one query to the next, don't sit on a common scale, so no lone
 * threshold can be right. A photograph counts as a match when it is all of:
 *  - near in absolute terms (`minScore`), so a query about nothing in the
 *    archive finds nothing rather than the least unlikely photographs;
 *  - well clear of the archive as a whole (`minZ` standard deviations above
 *    the mean score for this query), so what stands out is what is returned;
 *  - close to the best match (`maxGap`), so one striking photograph doesn't
 *    drag a long tail of weak ones in behind it.
 * The constants come from scoring real queries against the archive with
 * `pnpm images:embeddings --probe` (see scripts/backfill-embeddings.ts).
 */
export const MATCH_RULE = { minScore: 0.05, minZ: 1.5, maxGap: 0.12, maxResults: 60 };

/** Below this many scored photographs the spread says too little to use. */
const MIN_FOR_SPREAD = 8;

/** The matches among `scored` (best first, as `scoreImages` answers). */
export function selectMatches(scored: Scored[], rule = MATCH_RULE): Scored[] {
	if (scored.length === 0) return [];
	const best = scored[0].score;
	let floor = Math.max(rule.minScore, best - rule.maxGap);
	if (scored.length >= MIN_FOR_SPREAD) {
		const mean = scored.reduce((sum, s) => sum + s.score, 0) / scored.length;
		const sd = Math.sqrt(scored.reduce((sum, s) => sum + (s.score - mean) ** 2, 0) / scored.length);
		floor = Math.max(floor, mean + rule.minZ * sd);
	}
	return scored.filter((s) => s.score >= floor).slice(0, rule.maxResults);
}
