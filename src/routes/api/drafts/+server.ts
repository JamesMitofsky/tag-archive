import { error, json } from '@sveltejs/kit';
import { issueDraft } from '$lib/server/drafts';
import { consume, LIMITS } from '$lib/server/rateLimit';
import { verifyTurnstile } from '$lib/server/turnstile';
import type { RequestHandler } from './$types';

// Exchange a passed Turnstile challenge for a draft session (see
// $lib/server/drafts): the signed cookie that lets an anonymous visitor upload
// and submit for the next day. Also how an expired session is renewed — the
// draft id carries over, so earlier uploads stay attachable.
export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const ip = getClientAddress();
	if (!(await consume('draft-ip', ip, LIMITS.draftPerIp))) {
		throw error(429, 'Too many attempts — wait a little and try again');
	}

	const { token } = (await request.json().catch(() => ({}))) as { token?: string };
	const verdict = await verifyTurnstile(token, ip);
	if (verdict === 'unconfigured') throw error(503, 'Submissions are not available right now');
	if (verdict === 'failed') throw error(403, 'Could not confirm you are human — please try again');

	const { expiresAt } = issueDraft(cookies);
	return json({ expiresAt });
};
