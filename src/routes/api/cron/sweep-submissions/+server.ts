import { error, json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { pruneRateLimits } from '$lib/server/rateLimit';
import { cronToken } from '$lib/server/signing';
import { sweepAbandonedSubmissions } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

// Daily housekeeping for anonymous submissions, called by the scheduled
// function in netlify/functions/sweep-submissions.mts (a scheduled function has
// no public URL of its own, so the work lives here and it just calls in).
// Guarded by a bearer derived from BETTER_AUTH_SECRET — see $lib/server/signing.
export const POST: RequestHandler = async ({ request }) => {
	const expected = Buffer.from(`Bearer ${cronToken()}`);
	const given = Buffer.from(request.headers.get('authorization') ?? '');
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
		throw error(401, 'Unauthorized');
	}

	const images = await sweepAbandonedSubmissions();
	const counters = await pruneRateLimits(2 * 24 * 60 * 60 * 1000);
	return json({ images, counters });
};
