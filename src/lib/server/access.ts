import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import {
	mintPass,
	PASS_COOKIE,
	PASS_TTL_MS,
	verifyPass,
	type Pass,
	type PassKind
} from '$lib/access/pass';
import { freshDraft, issueDraft } from './drafts';

/**
 * SvelteKit's side of the access pass ($lib/access/pass): reading it from the
 * request and setting it on the response. The edge gate only ever reads it.
 */

/** A keeper's pass is re-minted once less than this remains, on any request. */
const KEEPER_RENEW_MS = 60 * 60 * 1000;

function secret(): string {
	const value = env.BETTER_AUTH_SECRET;
	if (!value) throw new Error('BETTER_AUTH_SECRET is not set');
	return value;
}

/** The visitor's pass, if genuine and unexpired. */
export function readPass(cookies: Cookies, now = Date.now()): Promise<Pass | null> {
	return verifyPass(env.BETTER_AUTH_SECRET ?? '', cookies.get(PASS_COOKIE), now);
}

/** Issue a fresh pass of `kind` (3h) and set it on the response. */
export async function issuePass(cookies: Cookies, kind: PassKind, now = Date.now()): Promise<Pass> {
	const { token, pass } = await mintPass(secret(), kind, now, PASS_TTL_MS);
	cookies.set(PASS_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: Math.floor(PASS_TTL_MS / 1000)
	});
	return pass;
}

/**
 * A signed-in keeper's pass: kept topped up so the public site stays open to
 * them for as long as they are signed in, without ever tapping.
 */
export async function keeperPass(cookies: Cookies, current: Pass | null, now = Date.now()) {
	if (current && current.expiresAt - now > KEEPER_RENEW_MS) return current;
	return issuePass(cookies, 'k', now);
}

/**
 * Under `vite dev` there is no tag to hand, so every visitor is treated as
 * fresh from a tap. Set DEV_REQUIRE_TAP=true to try the locked flow locally
 * (with `pnpm nfc:tap`). `dev` is false in every build, so production and
 * `vite preview` always keep the gate.
 */
export function devSkipsTap(): boolean {
	return dev && env.DEV_REQUIRE_TAP !== 'true';
}

/**
 * What a tap would grant (src/routes/t): a tap pass and a fresh upload draft,
 * re-issued whenever either runs out.
 */
export async function devTapPass(cookies: Cookies, current: Pass | null, now = Date.now()) {
	if (!freshDraft(cookies, now)) issueDraft(cookies, now);
	return current ?? issuePass(cookies, 't', now);
}
