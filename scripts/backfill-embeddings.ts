/**
 * Embed every photograph that has no content-search vector yet (see
 * #lib/server/imageEmbeddings), or one from a model other than the current
 * one, and test how queries score against what is there.
 *
 * New uploads embed themselves, and the nightly sweep catches up whatever they
 * miss, so this is for the photographs recorded before content search existed,
 * and for re-embedding the archive after a change of model, without waiting
 * on the sweep's five minutes a night.
 *
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… pnpm images:embeddings
 *       counts what is waiting, calling nothing
 *   … CLOUDFLARE_AI_TOKEN=… R2_ACCOUNT_ID=… VERCEL_TOKEN=… pnpm images:embeddings --apply
 *       embeds and stores it, then refreshes the site's cached search answers
 *   … CLOUDFLARE_AI_TOKEN=… R2_ACCOUNT_ID=… pnpm images:embeddings --probe flower --probe fire
 *       scores each query against every embedded photograph and prints the
 *       spread and the matches, to tune `MATCH_RULE`
 *
 * The account is CLOUDFLARE_ACCOUNT_ID, else R2_ACCOUNT_ID, as in the app. A
 * local database URL (`file:`, `http://`) has no cache to refresh, so it is
 * never purged; --no-purge skips it for a remote one.
 */
import { parseArgs } from 'node:util';
import { createClient } from '@libsql/client';
import {
	embedPending,
	embedQuery,
	pendingImages,
	scoreImages,
	selectMatches,
	MATCH_RULE,
	type EmbeddingConfig
} from '#lib/server/imageEmbeddings.ts';
import { purgeArchiveCache, vercelProject } from '#lib/server/events-import/purge.ts';

const { values: args } = parseArgs({
	options: {
		apply: { type: 'boolean', default: false },
		'no-purge': { type: 'boolean', default: false },
		probe: { type: 'string', multiple: true, default: [] }
	}
});

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const remote = url.startsWith('libsql://') || url.startsWith('https://');
const purge = args.apply && remote && !args['no-purge'];
const vercelToken = process.env.VERCEL_TOKEN;

function config(): EmbeddingConfig {
	const token = process.env.CLOUDFLARE_AI_TOKEN;
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
	if (!token || !accountId) {
		throw new Error('Set CLOUDFLARE_AI_TOKEN and CLOUDFLARE_ACCOUNT_ID (or R2_ACCOUNT_ID).');
	}
	return { token, accountId };
}

/** A display copy by its public URL, as a visitor's browser would fetch it. */
async function read(displayUrl: string): Promise<Uint8Array | null> {
	const res = await fetch(displayUrl);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`${res.status} fetching ${displayUrl}`);
	return new Uint8Array(await res.arrayBuffer());
}

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
try {
	if (args.probe.length > 0) {
		const cfg = config();
		for (const query of args.probe) {
			const scored = await scoreImages(client, await embedQuery(cfg, query));
			const matches = selectMatches(scored);
			const values = scored.map((s) => s.score);
			const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
			const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length || 1));
			console.log(
				`\n"${query}": ${scored.length} photograph(s), mean ${mean.toFixed(3)}, sd ${sd.toFixed(3)}, ` +
					`${matches.length} match(es) under ${JSON.stringify(MATCH_RULE)}`
			);
			const urls = await client.execute('SELECT id, url FROM image');
			const urlOf = new Map(urls.rows.map((r) => [Number(r.id), String(r.url)]));
			const matched = new Set(matches.map((m) => m.id));
			for (const s of scored.slice(0, Math.max(15, matches.length + 5))) {
				const z = sd > 0 ? (s.score - mean) / sd : 0;
				console.log(
					`  ${matched.has(s.id) ? '✓' : ' '} ${s.score.toFixed(3)}  z ${z.toFixed(2)}  image ${s.id}  ${urlOf.get(s.id)}`
				);
			}
		}
	} else if (!args.apply) {
		const waiting = await pendingImages(client, 1_000_000);
		console.log(
			`${waiting.length} photograph(s) waiting for a vector. Pass --apply to embed them.`
		);
	} else {
		// Checked before anything is written, so a run can't land half its job.
		if (purge) {
			if (!vercelToken) {
				throw new Error('Set VERCEL_TOKEN to refresh the site cache, or pass --no-purge.');
			}
			vercelProject();
		}
		const run = await embedPending({
			client,
			config: config(),
			read,
			budgetMs: Number.POSITIVE_INFINITY,
			onEach: (image, outcome) =>
				console.log(
					outcome === 'embedded'
						? `image ${image.id}\tembedded`
						: `image ${image.id}\tfailed: ${outcome.message}`
				)
		});
		console.log(`Embedded ${run.embedded} photograph(s); ${run.failed} failed.`);
		if (purge && run.embedded > 0) {
			await purgeArchiveCache(vercelToken!);
			console.log('Refreshed the site cache.');
		}
		if (run.failed > 0) process.exitCode = 1;
	}
} finally {
	client.close();
}
