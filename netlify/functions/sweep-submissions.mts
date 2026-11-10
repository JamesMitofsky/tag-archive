import { createHmac } from 'node:crypto';
import type { Config } from '@netlify/functions';

// Daily trigger for /api/cron/sweep-submissions, the uploads' housekeeping
// (see src/lib/server/uploads.ts). It deletes stale rate-limit counters, and,
// once more than a day old: photographs finalized but never saved into a set
// (rows and objects), anonymous uploads under `submissions/` that nothing
// uses, and keepers' photograph objects under `images/` that no row records
// (an upload that never reached finalize). It answers with a count per step
// (null for a step that failed, and then a 500), logged here.
// The work lives in the SvelteKit app (it needs the app's DB and storage
// modules); this only knocks on the door. The bearer mirrors `cronToken()` in
// src/lib/server/signing.ts — keep the two derivations identical.
export default async () => {
	const secret = process.env.BETTER_AUTH_SECRET;
	const site = process.env.URL;
	if (!secret || !site) {
		console.error('[sweep-submissions] BETTER_AUTH_SECRET or URL is not set');
		return;
	}

	const token = createHmac('sha256', secret).update('tag-archive:cron').digest('base64url');
	const res = await fetch(`${site}/api/cron/sweep-submissions`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}` }
	});
	console.log('[sweep-submissions]', res.status, await res.text());
};

export const config: Config = { schedule: '@daily' };
