import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * Purpose-bound HMAC keys derived from BETTER_AUTH_SECRET, so features that
 * need to sign something (draft-session cookies, contact tokens, the cron
 * bearer) don't each need their own secret — and a value signed for one purpose
 * can never be replayed as another, because each purpose gets its own key.
 *
 * The derivation is mirrored, deliberately, in
 * netlify/functions/sweep-submissions.mts for the cron bearer.
 */
function key(purpose: string): Buffer {
	const secret = env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error('BETTER_AUTH_SECRET is not set');
	return createHmac('sha256', secret).update(`tag-archive:${purpose}`).digest();
}

/** Sign `payload` for `purpose`; base64url, safe in cookies and URLs. */
export function sign(purpose: string, payload: string): string {
	return createHmac('sha256', key(purpose)).update(payload).digest('base64url');
}

/** Constant-time check that `signature` is `sign(purpose, payload)`. */
export function verify(purpose: string, payload: string, signature: string): boolean {
	const expected = Buffer.from(sign(purpose, payload));
	const given = Buffer.from(signature);
	return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The bearer token the scheduled sweep presents to /api/cron/*. */
export function cronToken(): string {
	return key('cron').toString('base64url');
}
