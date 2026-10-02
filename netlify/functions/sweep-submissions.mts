import { createHmac } from 'node:crypto';
import type { Config } from '@netlify/functions';

// Daily trigger for /api/cron/sweep-submissions, which deletes images from
// abandoned anonymous submissions and stale rate-limit counters. The work lives
// in the SvelteKit app (it needs the app's DB and storage modules); this only
// knocks on the door. The bearer mirrors `cronToken()` in
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
