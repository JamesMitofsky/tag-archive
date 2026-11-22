import { error } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import type { Config } from '@sveltejs/adapter-vercel';
import { CRON_SECRET } from '$app/env/private';
import { purgeArchiveCache } from '#lib/server/cache.ts';
import { embedMissing } from '#lib/server/contentSearch.ts';
import { readDisplayCopy } from '#lib/server/imageUploads.ts';
import { pruneRateLimits } from '#lib/server/rateLimit.ts';
import {
	sweepAbandonedSubmissions,
	sweepOrphanObjects,
	sweepUnattachedImages
} from '#lib/server/uploads.ts';
import type { RequestHandler } from './$types';

/**
 * Run one housekeeping step, so a failing step (a storage outage, say) is
 * logged and reported as null without keeping the others from running.
 */
async function step(name: string, run: () => Promise<number>): Promise<number | null> {
	try {
		return await run();
	} catch (e) {
		console.error(`[sweep-submissions] ${name} failed`, e);
		return null;
	}
}

/**
 * The bucket listings grow with the archive, so give the sweep the Hobby
 * plan's full five minutes rather than the default.
 */
export const config: Config = { maxDuration: 300 };

/**
 * Whether `authorization` is the bearer Vercel Cron presents: the project's
 * CRON_SECRET, compared in constant time. With no secret set, nothing is.
 */
function isCron(authorization: string | null): boolean {
	const secret = CRON_SECRET;
	if (!secret) {
		console.error('[sweep-submissions] CRON_SECRET is not set');
		return false;
	}
	const expected = Buffer.from(`Bearer ${secret}`);
	const given = Buffer.from(authorization ?? '');
	return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * How long the whole run may go before the embedding catch-up stops starting
 * new photographs: the five minutes of `maxDuration` less room for the last
 * round of calls (each capped at 30 seconds) and the response.
 */
const RUN_BUDGET_MS = 240_000;

/**
 * Embed photographs that have no vector yet (see #lib/server/contentSearch),
 * counting those embedded. A photograph that fails is logged and tried again
 * tomorrow, without failing the run: it is behind, not broken. Anything
 * embedded refreshes the cached archive, whose search answers it changes.
 */
async function embedMissingPhotographs(budgetMs: number): Promise<number> {
	const run = await embedMissing(budgetMs, readDisplayCopy);
	if (!run) {
		console.warn('[sweep-submissions] CLOUDFLARE_AI_TOKEN is not set: no photographs embedded');
		return 0;
	}
	if (run.failed > 0) console.error(`[sweep-submissions] ${run.failed} photograph(s) not embedded`);
	if (run.embedded > 0) await purgeArchiveCache();
	return run.embedded;
}

// Daily housekeeping for uploads and anonymous submissions, run by the Vercel
// Cron Job in vercel.json. Cron calls with GET, and only the bearer guards it:
// it changes state, but no browser can send the header, so no other page can
// trigger it. Delivery is best effort and may repeat a run, which is safe:
// every sweep only removes what is already stale, so a second pass finds less,
// and the embedding catch-up never replaces a vector the current model made.
export const GET: RequestHandler = async ({ request }) => {
	if (!isCron(request.headers.get('authorization'))) throw error(401, 'Unauthorized');
	const started = Date.now();

	// Sequential. The counters first: one quick query that nothing else needs,
	// so a slow storage step after it can't keep it from running. Then
	// unattached rows before the object sweeps: an object whose delete fails
	// there has no row left, so the object sweeps pick it up this same run. The
	// bucket listings, which grow with the archive, go last.
	const counters = await step('rate-limit counters', () =>
		pruneRateLimits(2 * 24 * 60 * 60 * 1000)
	);
	const unattachedImages = await step('unattached images', () => sweepUnattachedImages());
	const images = await step('abandoned submissions', () => sweepAbandonedSubmissions());
	const orphanObjects = await step('orphan objects', () => sweepOrphanObjects());
	// Last, with what is left of the run: catching up is the one step that can
	// always use more time, and whatever it doesn't reach waits for tomorrow.
	const embeddings = await step('image embeddings', () =>
		embedMissingPhotographs(Math.max(0, RUN_BUDGET_MS - (Date.now() - started)))
	);

	const report = { images, unattachedImages, orphanObjects, counters, embeddings };
	// A 500 shows up in the cron job's log; the body says which step.
	const failed = Object.values(report).some((n) => n === null);
	return Response.json(report, { status: failed ? 500 : 200 });
};
