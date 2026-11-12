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

/**
 * SvelteKit's side of the access pass ($lib/access/pass): reading it from the
 * request and setting it on the response. The edge gate only ever reads it.
 *
 * A pass is set on a response in exactly three places: the tap (src/routes/t),
 * the presence beat (src/routes/api/presence, the only place a pass SLIDES),
 * and `keeperPass` below, which hands a signed-in keeper a pass when they hold
 * none. Nothing else sets one, and `keeperPass` refuses to on a response the
 * CDN might cache (see `mayIssuePass`): a `Set-Cookie` stored at the edge
 * would hand one visitor's pass to everyone who fetched the same URL.
 */

function secret(): string {
	const value = env.BETTER_AUTH_SECRET;
	if (!value) throw new Error('BETTER_AUTH_SECRET is not set');
	return value;
}

/** The visitor's pass, if genuine and unexpired. */
export function readPass(cookies: Cookies, now = Date.now()): Promise<Pass | null> {
	return verifyPass(env.BETTER_AUTH_SECRET ?? '', cookies.get(PASS_COOKIE), now);
}

/** Issue a fresh pass of `kind`, good for PASS_TTL_MS, and set it on the response. */
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
 * Slide a valid pass: re-mint it, same kind, for another PASS_TTL_MS from now.
 * The presence beat calls this while the site is on the visitor's screen.
 */
export function touchPass(cookies: Cookies, current: Pass, now = Date.now()): Promise<Pass> {
	return issuePass(cookies, current.kind, now);
}

/** The shape of a request that `mayIssuePass` and the gate both decide on. */
export type RequestShape = {
	method: string;
	accept: string | null;
	isDataRequest: boolean;
	isEnhancedAction: boolean;
};

/**
 * Whether a response to this request may carry a new pass cookie: only when
 * the CDN can never cache it. Vercel's CDN caches GET and HEAD alone, so any write
 * qualifies; of the reads, a page view, a SvelteKit data load and an enhanced
 * action are rendered per visitor and never cached. A bare `fetch` of an
 * endpoint — `GET /api/dataset`, cached at the edge for everyone — is not.
 */
export function mayIssuePass(request: RequestShape): boolean {
	const isRead = request.method === 'GET' || request.method === 'HEAD';
	if (!isRead) return true;
	return (
		request.isDataRequest ||
		request.isEnhancedAction ||
		(request.accept ?? '').includes('text/html')
	);
}

/**
 * A signed-in keeper's pass: their session is the real credential, so a keeper
 * who holds no valid pass is handed one — on any request whose response the CDN
 * cannot cache — and is never locked out for being away. Keeping it topped up
 * is the presence beat's job, the same as for everyone else; a keeper's bare
 * fetch without a pass gets the gate's 401 like anyone's, and the next beat
 * (a POST) mends it.
 */
export async function keeperPass(
	cookies: Cookies,
	current: Pass | null,
	request: RequestShape,
	now = Date.now()
): Promise<Pass | null> {
	if (current) return current;
	if (!mayIssuePass(request)) return null;
	return issuePass(cookies, 'k', now);
}
