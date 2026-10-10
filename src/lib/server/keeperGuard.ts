/**
 * Everything under /keeper requires a session, enforced once in
 * hooks.server.ts instead of by a `locals.user` check repeated in every load,
 * action, and endpoint. Those per-route checks stay, but only as type narrowing
 * and defense in depth: forgetting one is no longer a hole. The one exception is
 * /keeper itself, the sign-in page, which the access gate opens to visitors
 * without a pass only through its door (see $lib/access/keeperDoor.server).
 */

/** True for the sign-in page, the only /keeper path open without a session. */
export function isKeeperGate(pathname: string): boolean {
	return pathname === '/keeper' || pathname === '/keeper/';
}

/** True when `pathname` is inside the signed-in keeper area. */
export function isKeeperArea(pathname: string): boolean {
	return pathname.startsWith('/keeper/') && !isKeeperGate(pathname);
}

/**
 * What the hook does with an anonymous request:
 *  - `allow`: outside the keeper area (or the sign-in page itself);
 *  - `redirect`: a page view, client-side navigation, or form action — send it
 *    to sign-in. SvelteKit serialises a redirect thrown from `handle` correctly
 *    for each of these (a JSON redirect for `__data.json` and enhanced actions,
 *    a 303 otherwise), so the browser lands on the sign-in page either way;
 *  - `refuse`: anything else (a `fetch` to a +server endpoint) gets a 401. A
 *    redirect would be followed by `fetch` into an HTML page the caller can't use.
 */
export function anonymousKeeperAccess(request: {
	pathname: string;
	method: string;
	isDataRequest: boolean;
	accept: string | null;
	isEnhancedAction: boolean;
}): 'allow' | 'redirect' | 'refuse' {
	if (!isKeeperArea(request.pathname)) return 'allow';

	const acceptsHtml = (request.accept ?? '').includes('text/html');
	const isRead = request.method === 'GET' || request.method === 'HEAD';
	if (isRead && (request.isDataRequest || acceptsHtml)) return 'redirect';
	// A form action: enhanced (fetch with the action header) or a plain no-JS POST.
	if (request.method === 'POST' && (request.isEnhancedAction || acceptsHtml)) return 'redirect';
	return 'refuse';
}
