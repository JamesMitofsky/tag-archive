/**
 * The whole site opens only to holders of an access pass (./pass): visitors who
 * tapped the garden's NFC tag, came through the door (./door.server) or
 * brought an unlock key (./key.server), and
 * have had the site on screen since (the pass drifts shut after a while away,
 * see ./presence), and signed-in keepers.
 * This decides what happens to a request WITHOUT a valid pass. It is enforced
 * twice, from this one list:
 *
 *  - middleware.ts (Vercel Routing Middleware), in front of everything — the
 *    only layer that sees static files (scans, audio) and CDN-cached responses
 *    (/api/dataset), which never reach SvelteKit;
 *  - hooks.server.ts, for every SvelteKit request — defense in depth in
 *    production, and the only gate under `vite dev`, where the middleware
 *    doesn't run.
 *
 * Imports nothing but its siblings, by relative path with a .js extension, so
 * the middleware bundle can load it (see middleware.ts). Server and middleware only: the browser gets LOCKED_PATH from
 * ./paths.
 */

import { opensDoor } from './door.server.js';
import { carriesKey, UNLOCK_PATH } from './key.server.js';
import { CONTRIBUTE_PATH, isUnder, KEEPER_PATH, LOCKED_PATH, PRESENCE_PATH } from './paths.js';

export { LOCKED_PATH };

export type GateDecision = 'open' | 'unlock' | 'redirect' | 'refuse';

/** Paths that are always open, exactly. */
const OPEN_EXACT = new Set([
	// The tap itself, and where a locked visitor is told to make one.
	'/t',
	LOCKED_PATH,
	// Where a navigation carrying an unlock key is checked (./key.server).
	UNLOCK_PATH,
	// The keeper sign-in page, so a keeper can always reach it to sign in, from
	// anywhere, like the locked page. It shows nothing from the archive, and
	// signing in still takes a one-time code emailed to an existing account.
	// The keeper tools beneath it are open at the gate too (OPEN_PREFIXES) but
	// guarded by session in hooks.server.ts (see #lib/server/keeperGuard).
	KEEPER_PATH,
	// The presence beat. Open here for the same reason as /keeper/ below: a
	// signed-in keeper whose pass has lapsed must reach SvelteKit, where their
	// session mints a new one. The route itself answers 401 to anyone without a
	// pass (src/routes/api/presence), and a beat carries no archive content.
	PRESENCE_PATH,
	// Decor the locked and sign-in pages are drawn with.
	'/favicon.png',
	'/paper-noise.png',
	'/robots.txt'
]);

/**
 * Path prefixes that are always open. Everything here is either guarded
 * elsewhere or carries nothing from the archive itself.
 */
export const OPEN_PREFIXES = [
	// Every route checks the keeper session (see keeperGuard), and an anonymous
	// visit is sent to the sign-in page at /keeper. Open here so that a keeper
	// whose pass has lapsed still reaches SvelteKit, where their session renews it.
	'/keeper/',
	'/api/auth/', // better-auth sign-in endpoints
	'/api/cron/', // bearer-authenticated scheduled jobs
	'/_app/', // the app's code bundles
	'/drawing/', // hand-drawn decor
	'/clouds/' // sky decor
];

/** Strip what SvelteKit appends for client-side data loads (`/x/__data.json`). */
export function routePath(pathname: string): string {
	const route = pathname.replace(/\/__data\.json$/, '') || '/';
	return route.length > 1 ? route.replace(/\/+$/, '') : route;
}

export function isOpenPath(pathname: string): boolean {
	const route = routePath(pathname);
	return OPEN_EXACT.has(route) || OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Enhanced form actions on the contribution forms — /contribute and the pages
 * beneath it, such as /contribute/images — pass the gate, because those
 * actions guard themselves: an anonymous submit needs an open pass and a draft
 * session, which only a tap or the door issues (see #lib/server/drafts).
 * Turning the post away here instead would replace a half-filled form with the
 * locked page when the
 * visitor's hours run out mid-entry; the action's own refusal keeps the form
 * and says "tap again". Only enhanced posts that SvelteKit will answer with
 * the action's result alone (`answersWithActionResult`), whereas a plain post
 * renders the whole page, load data and all. So every POST handler under
 * /contribute — form action or endpoint — must guard itself. Never a data
 * request, whatever its headers say: SvelteKit answers `__data.json` with the
 * route's load data for any method, POST included.
 */
function isSelfGuardedWrite(request: {
	pathname: string;
	method: string;
	accept: string | null;
	isDataRequest: boolean;
	isEnhancedAction?: boolean;
}): boolean {
	return (
		request.method === 'POST' &&
		!!request.isEnhancedAction &&
		answersWithActionResult(request.accept) &&
		!request.isDataRequest &&
		isUnder(routePath(request.pathname), CONTRIBUTE_PATH)
	);
}

/**
 * Whether SvelteKit answers a page POST with the action's result alone (JSON),
 * rather than running the action and rendering the whole page around it. It
 * decides from the Accept header, not `x-sveltekit-action`, and reads a
 * missing one as accepting anything, which it answers with JSON
 * (`is_action_json_request` in @sveltejs/kit/src/runtime/server/page/actions.js).
 */
function answersWithActionResult(accept: string | null): boolean {
	return negotiate(accept ?? '*/*', ['application/json', 'text/html']) === 'application/json';
}

/**
 * Which of `types` an Accept header prefers, or undefined for none: SvelteKit's
 * own `negotiate` (@sveltejs/kit/src/utils/http.js), copied rather than
 * imported so the middleware bundle can load this file, and kept to the letter so
 * the gate reads a header exactly as SvelteKit will. Like it, an entry with
 * q=0 still accepts, only last.
 */
function negotiate(accept: string, types: string[]): string | undefined {
	const parts: { type: string; subtype: string; q: number; i: number }[] = [];
	accept.split(',').forEach((entry, i) => {
		const match = /([^/ \t]+)\/([^; \t]+)[ \t]*(?:;[ \t]*q=([0-9.]+))?/.exec(entry);
		// An entry it can't read is ignored, as SvelteKit ignores it.
		if (match) {
			const [, type, subtype, q = '1'] = match;
			parts.push({ type, subtype, q: +q, i });
		}
	});
	// Highest q first; on a tie, exact before wildcard, then header order.
	parts.sort((a, b) => {
		if (a.q !== b.q) return b.q - a.q;
		if ((a.subtype === '*') !== (b.subtype === '*')) return a.subtype === '*' ? 1 : -1;
		if ((a.type === '*') !== (b.type === '*')) return a.type === '*' ? 1 : -1;
		return a.i - b.i;
	});
	let accepted: string | undefined;
	let best = Infinity;
	for (const mimetype of types) {
		const [type, subtype] = mimetype.split('/');
		const rank = parts.findIndex(
			(part) =>
				(part.type === type || part.type === '*') &&
				(part.subtype === subtype || part.subtype === '*')
		);
		if (rank !== -1 && rank < best) {
			accepted = mimetype;
			best = rank;
		}
	}
	return accepted;
}

/** The shape of a request the gate decides on. */
export type GateRequest = {
	pathname: string;
	/** The URL's query string, which may carry the door phrase or an unlock key. */
	search?: string;
	method: string;
	accept: string | null;
	isDataRequest: boolean;
	/** A `use:enhance` form post (the `x-sveltekit-action: true` header). */
	isEnhancedAction?: boolean;
};

/** A browser asking for a page to show: a read that wants HTML, not data. */
function isPageView(request: GateRequest): boolean {
	const isRead = request.method === 'GET' || request.method === 'HEAD';
	return isRead && (request.accept ?? '').includes('text/html') && !request.isDataRequest;
}

/**
 * A navigation through the door (./door.server): a page view, or the client-side
 * data load for one, whose URL carries the door phrase. On any path. SvelteKit
 * answers it with a pass and a redirect to the same URL without the phrase
 * (hooks.server.ts); both kinds of response are rendered per visitor, never
 * cached, so they may carry the pass cookie (#lib/server/access, mayIssuePass).
 */
export function isDoorNavigation(request: GateRequest): boolean {
	const isRead = request.method === 'GET' || request.method === 'HEAD';
	return (
		(isPageView(request) || (isRead && request.isDataRequest)) && opensDoor(request.search ?? '')
	);
}

/**
 * A navigation carrying an unlock key (./key.server), whatever its value: a
 * page view, or the client-side data load for one, on any path. Only SvelteKit
 * can check the key against the database, so these go to UNLOCK_PATH, which
 * does (hooks.server.ts and ./edge send them there).
 */
export function isKeyNavigation(request: GateRequest): boolean {
	const isRead = request.method === 'GET' || request.method === 'HEAD';
	return (
		(isPageView(request) || (isRead && request.isDataRequest)) && carriesKey(request.search ?? '')
	);
}

/**
 * What to do with a request that carries no valid pass:
 *  - `open`: always-open paths (above), navigations through the door, and the
 *    data load of a key navigation — always answered by SvelteKit, whose hooks
 *    send it on to UNLOCK_PATH as a JSON redirect the client can follow;
 *  - `unlock`: a page view carrying a key — send it to UNLOCK_PATH. Not let
 *    through like the door, because the key is unchecked here and the path may
 *    be a static file the CDN would serve without asking SvelteKit;
 *  - `redirect`: a page view — send it to the locked page;
 *  - `refuse`: anything else (data loads, API calls, files) gets a 401. A
 *    redirect would be followed by `fetch` into an HTML page the caller can't use.
 */
export function accessDecision(request: GateRequest): GateDecision {
	if (isOpenPath(request.pathname) || isSelfGuardedWrite(request)) return 'open';
	if (isDoorNavigation(request)) return 'open';
	if (isKeyNavigation(request)) return request.isDataRequest ? 'open' : 'unlock';
	return isPageView(request) ? 'redirect' : 'refuse';
}
