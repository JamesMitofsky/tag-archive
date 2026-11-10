import { error, json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { pruneRateLimits } from '$lib/server/rateLimit';
import { cronToken } from '$lib/server/signing';
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

// Daily housekeeping for uploads and anonymous submissions, called by the
// scheduled function in netlify/functions/sweep-submissions.mts (a scheduled
// function has no public URL of its own, so the work lives here and it just
// calls in). Guarded by a bearer derived from BETTER_AUTH_SECRET — see
// $lib/server/signing.
export const POST: RequestHandler = async ({ request }) => {
	const expected = Buffer.from(`Bearer ${cronToken()}`);
	const given = Buffer.from(request.headers.get('authorization') ?? '');
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
		throw error(401, 'Unauthorized');
	}

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
	// A 500 shows up in the scheduled function's log; the body says which step.
	const failed = Object.values(report).some((n) => n === null);
	return json(report, { status: failed ? 500 : 200 });
};
