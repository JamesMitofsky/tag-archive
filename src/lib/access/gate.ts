/**
 * The whole site opens only to holders of an access pass (./pass): visitors who
 * tapped the garden's NFC tag in the last few hours, and signed-in keepers.
 * This decides what happens to a request WITHOUT a valid pass. It is enforced
 * twice, from this one list:
 *
 *  - netlify/edge-functions/access-gate.ts, in front of everything — the only
 *    layer that sees static files (scans, audio) and CDN-cached responses
 *    (/api/dataset), which never reach SvelteKit;
 *  - hooks.server.ts, for every SvelteKit request — defense in depth in
 *    production, and the only gate under `vite dev`, where edge functions
 *    don't run.
 *
 * Imports nothing, so the edge bundle can load it by relative path.
 */

export type GateDecision = 'open' | 'redirect' | 'refuse';

/** Where a locked page view is sent. */
export const LOCKED_PATH = '/locked';

/** Paths that are always open, exactly. */
const OPEN_EXACT = new Set([
	// The tap itself, and where a locked visitor is told to make one.
	'/t',
	LOCKED_PATH,
	// Keeper sign-in: the bypass. /keeper/* is guarded by its own sign-in check.
	'/keeper',
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
	'/keeper/', // every route checks the keeper session (see keeperGuard)
	'/api/auth/', // better-auth sign-in endpoints
	'/api/cron/', // bearer-authenticated scheduled jobs
	'/_app/', // the app's code bundles
	'/drawing/', // hand-drawn decor
	'/clouds/', // sky decor
	'/email/' // images in sign-in emails, fetched by mail clients without cookies
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
 * Enhanced form actions on /contribute pass the gate, because those actions
 * guard themselves: an anonymous submit needs a fresh draft session, which only
 * a tap issues (see $lib/server/drafts). Turning the post away here instead
 * would replace a half-filled form with the locked page when the visitor's
 * hours run out mid-entry; the action's own refusal keeps the form and says
 * "tap again". Only enhanced posts: their response is the action's result
 * alone, whereas a plain post renders the whole page, load data and all.
 */
function isSelfGuardedWrite(request: {
	pathname: string;
	method: string;
	isEnhancedAction?: boolean;
}): boolean {
	return (
		request.method === 'POST' &&
		!!request.isEnhancedAction &&
		routePath(request.pathname) === '/contribute'
	);
}

/**
 * What to do with a request that carries no valid pass:
 *  - `open`: always-open paths (above);
 *  - `redirect`: a page view — send it to the locked page;
 *  - `refuse`: anything else (data loads, API calls, files) gets a 401. A
 *    redirect would be followed by `fetch` into an HTML page the caller can't use.
 */
export function accessDecision(request: {
	pathname: string;
	method: string;
	accept: string | null;
	isDataRequest: boolean;
	/** A `use:enhance` form post (the `x-sveltekit-action: true` header). */
	isEnhancedAction?: boolean;
}): GateDecision {
	if (isOpenPath(request.pathname) || isSelfGuardedWrite(request)) return 'open';
	const isRead = request.method === 'GET' || request.method === 'HEAD';
	const wantsPage = (request.accept ?? '').includes('text/html');
	return isRead && wantsPage && !request.isDataRequest ? 'redirect' : 'refuse';
}
