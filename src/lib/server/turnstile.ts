import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

/**
 * Server half of Cloudflare Turnstile, the bot check in front of anonymous
 * submissions. `ok` / `failed` are the obvious verdicts; `unconfigured` means
 * TURNSTILE_SECRET_KEY is missing outside dev — callers refuse the write
 * (fail closed) rather than let anonymous traffic through unchecked.
 *
 * In dev, a missing key is treated as a pass so local work needs no Cloudflare
 * account; `.env.example` also lists Cloudflare's always-pass test keys for
 * exercising the real widget locally.
 */
export type TurnstileVerdict = 'ok' | 'failed' | 'unconfigured';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
	token: string | null | undefined,
	remoteIp: string | null
): Promise<TurnstileVerdict> {
	const secret = env.TURNSTILE_SECRET_KEY;
	if (!secret) {
		if (dev) return 'ok';
		console.error('[turnstile] TURNSTILE_SECRET_KEY is not set — refusing anonymous writes');
		return 'unconfigured';
	}
	if (!token) return 'failed';

	const body = new FormData();
	body.set('secret', secret);
	body.set('response', token);
	if (remoteIp) body.set('remoteip', remoteIp);

	try {
		const res = await fetch(SITEVERIFY, { method: 'POST', body });
		const outcome = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
		if (!outcome.success) console.warn('[turnstile] rejected', outcome['error-codes']);
		return outcome.success ? 'ok' : 'failed';
	} catch (e) {
		// Cloudflare unreachable: fail closed, like a missing key.
		console.error('[turnstile] siteverify failed', e);
		return 'failed';
	}
}
