/**
 * Step 1 of the events import: find event pages on ustreetcommunity.org that
 * the archive's seed doesn't have yet, and save each page's Squarespace JSON to
 * temp/events-import/raw/. Read-only against the site and touches no database.
 *
 *   pnpm events:fetch                       # live sitemap
 *   pnpm events:fetch --sitemap ~/sitemap.xml
 *   pnpm events:fetch --refresh             # re-download pages already saved
 *
 * Resumable: pages already on disk are skipped, except upcoming events, which
 * are re-fetched each run because their pages still change. Failures are
 * listed in fetch-report.json and retried on the next run.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadSeedData } from '../db/seed-core';
import {
	DEFAULT_TIME_ZONE,
	SITEMAP_URL,
	eventSlug,
	formatDate,
	jsonUrl,
	parseEventPage,
	parseSitemapEventUrls
} from './squarespace';
import { FETCH_REPORT, RAW_DIR, readJson, writeJson, type RawFile } from './workspace';

const { values: args } = parseArgs({
	options: {
		sitemap: { type: 'string' },
		refresh: { type: 'boolean', default: false },
		limit: { type: 'string' },
		'delay-ms': { type: 'string', default: '750' }
	}
});
const delayMs = Number(args['delay-ms']);

const USER_AGENT = 'tag-archive-events-import (+https://github.com/JamesMitofsky/tag-archive)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with retries for the failures worth retrying (network errors, 429, 5xx),
 * backing off 2s, 4s, 8s — or as long as a Retry-After header asks.
 */
async function get(url: string): Promise<Response> {
	for (let attempt = 1; ; attempt++) {
		let retryAfterMs = 2000 * 2 ** (attempt - 1);
		try {
			const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
			if (res.ok) return res;
			const retryable = res.status === 429 || res.status >= 500;
			if (!retryable || attempt === 4) throw new Error(`HTTP ${res.status} for ${url}`);
			const header = Number(res.headers.get('retry-after'));
			if (header > 0) retryAfterMs = header * 1000;
		} catch (err) {
			// fetch() throws TypeError on network failure; HTTP errors arrive above.
			if (!(err instanceof TypeError) || attempt === 4) throw err;
		}
		await sleep(retryAfterMs);
	}
}

/** An error's message, plus its cause: undici reports only "fetch failed" without it. */
function describe(err: unknown): string {
	if (!(err instanceof Error)) return String(err);
	return err.cause ? `${err.message} (${describe(err.cause)})` : err.message;
}

async function loadSitemap(): Promise<string> {
	if (!args.sitemap) return (await get(SITEMAP_URL)).text();
	if (/^https?:\/\//.test(args.sitemap)) return (await get(args.sitemap)).text();
	return readFileSync(args.sitemap, 'utf-8');
}

const rawPath = (url: string) => join(RAW_DIR, `${eventSlug(url)}.json`);
const today = formatDate(Date.now(), DEFAULT_TIME_ZONE);

/** Saved and in the past (so its page is settled): no need to fetch again. */
function isSettled(url: string): boolean {
	const path = rawPath(url);
	if (args.refresh || !existsSync(path)) return false;
	try {
		const { item, timeZone } = parseEventPage(readJson<RawFile>(path).page);
		return formatDate(item.startDate, timeZone) < today;
	} catch {
		return false;
	}
}

const sitemapUrls = parseSitemapEventUrls(await loadSitemap());
if (sitemapUrls.length === 0) {
	throw new Error('No event URLs found in the sitemap. Is it the ustreetcommunity.org sitemap?');
}
const seedUrls = new Set(loadSeedData().events.map((e) => e.url));
const candidates = sitemapUrls.filter((url) => !seedUrls.has(url));
const unsettled = candidates.filter((url) => !isSettled(url));
const queue = unsettled.slice(0, args.limit ? Number(args.limit) : undefined);

console.log(
	`${sitemapUrls.length} event pages in the sitemap, ${candidates.length} not in the seed; ` +
		`${candidates.length - unsettled.length} already saved, fetching ${queue.length}.`
);

const failed: { url: string; error: string }[] = [];
let fetched = 0;
for (const [i, url] of queue.entries()) {
	try {
		const res = await get(jsonUrl(url));
		const type = res.headers.get('content-type') ?? '';
		if (!type.includes('json')) {
			throw new Error(`expected JSON, got "${type}" — has the site disabled ?format=json?`);
		}
		const page: unknown = await res.json();
		const { item } = parseEventPage(page); // validate before saving
		writeJson(rawPath(url), { url, fetchedAt: new Date().toISOString(), page } satisfies RawFile);
		fetched++;
		console.log(`[${i + 1}/${queue.length}] ${item.title}`);
	} catch (err) {
		const error = describe(err);
		failed.push({ url, error });
		console.error(`[${i + 1}/${queue.length}] FAILED ${url}: ${error}`);
	}
	if (i < queue.length - 1) await sleep(delayMs);
}

writeJson(FETCH_REPORT, {
	ranAt: new Date().toISOString(),
	sitemapEventPages: sitemapUrls.length,
	alreadyInSeed: sitemapUrls.length - candidates.length,
	candidates: candidates.length,
	fetched,
	failed
});
console.log(
	`\nFetched ${fetched}, failed ${failed.length}. Report: ${FETCH_REPORT}` +
		(failed.length ? '\nRe-run to retry the failures.' : '\nNext: pnpm events:curate')
);
if (failed.length) process.exitCode = 1;
