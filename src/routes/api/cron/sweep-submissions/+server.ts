import { error, json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import type { Config } from '@sveltejs/adapter-vercel';
import { env } from '$env/dynamic/private';
import { pruneRateLimits } from '$lib/server/rateLimit';
import {
	sweepAbandonedSubmissions,
	sweepOrphanObjects,
	sweepUnattachedImages
} from '$lib/server/uploads';
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
	const secret = env.CRON_SECRET;
	if (!secret) {
		console.error('[sweep-submissions] CRON_SECRET is not set');
		return false;
	}
	const expected = Buffer.from(`Bearer ${secret}`);
	const given = Buffer.from(authorization ?? '');
	return expected.length === given.length && timingSafeEqual(expected, given);
}

// Daily housekeeping for uploads and anonymous submissions, run by the Vercel
// Cron Job in vercel.json. Cron calls with GET, and only the bearer guards it:
// it changes state, but no browser can send the header, so no other page can
// trigger it. Delivery is best effort and may repeat a run, which is safe:
// every step only removes what is already stale, so a second pass finds less.
export const GET: RequestHandler = async ({ request }) => {
	if (!isCron(request.headers.get('authorization'))) throw error(401, 'Unauthorized');

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

	const report = { images, unattachedImages, orphanObjects, counters };
	// A 500 shows up in the cron job's log; the body says which step.
	const failed = Object.values(report).some((n) => n === null);
	return json(report, { status: failed ? 500 : 200 });
};
