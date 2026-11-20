/**
 * Give every photograph that has no placeholder one (see
 * #lib/images/placeholder): read its WebP display copy back from the bucket,
 * decode it, and store the ThumbHash. New uploads get theirs from the
 * uploader; this is for the rows recorded before the `placeholder` column
 * existed, or by a browser that couldn't make one.
 *
 * A dry run by default: it decodes everything and prints what it would store,
 * writing nothing until --apply.
 *
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… pnpm images:placeholders
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… VERCEL_TOKEN=… \
 *     pnpm images:placeholders --apply
 *
 * After writing, it refreshes the site's cached dataset (see
 * #lib/server/events-import/purge), which needs VERCEL_TOKEN, unless
 * --no-purge. The database URL decides: a local one (`file:`, `http://`) has
 * no cache to refresh, so it is never purged.
 *
 * Only ever fills in a NULL, and re-checks that it is still NULL as it writes,
 * so a run racing an upload never overwrites the uploader's own placeholder,
 * and running it twice changes nothing. The audit columns are left alone: a
 * derived blur is not an edit anyone made.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createClient } from '@libsql/client';
import { placeholderFromRGBA } from '#lib/images/placeholder.ts';
import { purgeArchiveCache, vercelProject } from '#lib/server/events-import/purge.ts';

const { values: args } = parseArgs({
	options: {
		apply: { type: 'boolean', default: false },
		'no-purge': { type: 'boolean', default: false }
	}
});

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const remote = url.startsWith('libsql://') || url.startsWith('https://');
const purge = args.apply && remote && !args['no-purge'];
const token = process.env.VERCEL_TOKEN;
if (purge) {
	// Checked before anything is written, so a run can't land half its job.
	if (!token) throw new Error('Set VERCEL_TOKEN to refresh the site cache, or pass --no-purge.');
	vercelProject();
}

/**
 * libwebp's decoder. Under Node it can't fetch its .wasm by URL, so the module
 * is compiled from disk and handed over, as #lib/server/db/demoPhotos does for
 * the encoder.
 */
async function webpDecoder(): Promise<(bytes: ArrayBuffer) => Promise<ImageData>> {
	const libwebp = await import('@jsquash/webp/decode');
	const codecDir = join(
		dirname(createRequire(import.meta.url).resolve('@jsquash/webp/decode')),
		'codec/dec'
	);
	await libwebp.init(await WebAssembly.compile(readFileSync(join(codecDir, 'webp_dec.wasm'))));
	return libwebp.default;
}

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
try {
	const decode = await webpDecoder();
	const { rows } = await client.execute(
		'SELECT id, url FROM image WHERE placeholder IS NULL ORDER BY id'
	);
	console.log(`${rows.length} photograph(s) without a placeholder.`);

	let made = 0;
	let failed = 0;
	for (const row of rows) {
		const id = Number(row.id);
		const displayUrl = String(row.url);
		try {
			const res = await fetch(displayUrl);
			if (!res.ok) throw new Error(`${res.status} fetching ${displayUrl}`);
			const pixels = await decode(await res.arrayBuffer());
			const placeholder = placeholderFromRGBA(pixels.data, pixels.width, pixels.height);
			if (args.apply) {
				await client.execute({
					sql: 'UPDATE image SET placeholder = ? WHERE id = ? AND placeholder IS NULL',
					args: [placeholder, id]
				});
			}
			made += 1;
			console.log(`image ${id}\t${placeholder}`);
		} catch (e) {
			// One unreadable photograph keeps its gray card; the rest still get theirs.
			failed += 1;
			console.error(`image ${id}\tfailed: ${e instanceof Error ? e.message : e}`);
		}
	}

	console.log(
		args.apply
			? `Stored ${made} placeholder(s); ${failed} failed.`
			: `Dry run: ${made} placeholder(s) made, ${failed} failed. Pass --apply to store them.`
	);
	if (purge && made > 0) {
		await purgeArchiveCache(token!);
		console.log('Refreshed the site cache.');
	}
	if (failed > 0) process.exitCode = 1;
} finally {
	client.close();
}
