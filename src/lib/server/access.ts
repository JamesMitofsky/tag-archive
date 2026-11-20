import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/env';
import { BETTER_AUTH_SECRET } from '$app/env/private';
import { grantFile } from '#lib/access/fileGrant.ts';
import {
	mintPass,
	PASS_COOKIE,
	PASS_TTL_MS,
	verifyPass,
	type Pass,
	type PassKind
} from '#lib/access/pass.ts';

/**
 * SvelteKit's side of the access pass (#lib/access/pass): reading it from the
 * request and setting it on the response. The edge gate only ever reads it.
 *
 * A pass is set on a response in exactly three places: the tap (src/routes/t),
 * the presence beat (src/routes/api/presence, the only place a pass SLIDES),
 * and `sessionPass` below, which hands a signed-in account a pass when it holds
 * none. Nothing else sets one, and `sessionPass` refuses to on a response the
 * CDN might cache (see `mayIssuePass`): a `Set-Cookie` stored at the edge
 * would hand one visitor's pass to everyone who fetched the same URL.
 */

function secret(): string {
	const value = BETTER_AUTH_SECRET;
	if (!value) throw new Error('BETTER_AUTH_SECRET is not set');
	return value;
}

/** The visitor's pass, if genuine and unexpired. */
export function readPass(cookies: Cookies, now = Date.now()): Promise<Pass | null> {
	return verifyPass(BETTER_AUTH_SECRET ?? '', cookies.get(PASS_COOKIE), now);
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

/** The kinds of pass `sessionPass` hands out, one per kind of account. */
const SESSION_KINDS: readonly PassKind[] = ['k', 'l'];

/**
 * A signed-in account's pass: the session is the real credential, so an account
 * that holds no valid pass is handed one, of `kind` (`k` for a keeper, `l` for
 * a listener, see #lib/roles), on any request whose response the CDN cannot
 * cache, and is never locked out for being away. Keeping it topped up is the
 * presence beat's job, the same as for everyone else; a bare fetch without a
 * pass gets the gate's 401 like anyone's, and the next beat (a POST) mends it.
 *
 * A pass the account earned another way (a tap, the door, a key) is kept, so a
 * listener in the garden sees the whole site. But one a session handed out for
 * the other kind of account is swapped for this one: the beat slides a pass
 * for as long as it is on screen, so without the swap an admin turned listener
 * would keep a keeper's whole-site pass indefinitely, and a listener made a
 * keeper would stay held to the listener's page. Where the swap can't be set
 * (a cacheable fetch) the old pass counts for nothing on this request.
 */
export async function sessionPass(
	cookies: Cookies,
	current: Pass | null,
	request: RequestShape,
	kind: Extract<PassKind, 'k' | 'l'>,
	now = Date.now()
): Promise<Pass | null> {
	if (current && (current.kind === kind || !SESSION_KINDS.includes(current.kind))) return current;
	if (!mayIssuePass(request)) return null;
	return issuePass(cookies, kind, now);
}

/** How long a listener's file grant lasts, at the least (see `grantFiles`). */
export const FILE_GRANT_TTL_MS = 12 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * `urls` with each scan shipped with the deployment signed for a listener to
 * fetch (see #lib/access/fileGrant); bucket URLs, public already, as they were.
 *
 * Every grant handed out within the same hour runs out at the same moment, at
 * least FILE_GRANT_TTL_MS away, so a page loaded twice in an hour asks for the
 * same URLs and the browser's cache answers the second time. The margin is
 * long so that a page left open all day still opens a card's later pages.
 */
export function grantFiles(urls: string[], now = Date.now()): Promise<string[]> {
	const expiresAt = Math.ceil((now + FILE_GRANT_TTL_MS) / HOUR_MS) * HOUR_MS;
	return Promise.all(urls.map((url) => grantFile(secret(), url, expiresAt)));
}
