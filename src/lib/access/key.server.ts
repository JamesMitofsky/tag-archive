/**
 * Unlock keys: a way into the archive from anywhere, handed out one person at a
 * time and closing by itself. Any page of the site opens to a visitor without
 * an access pass when its URL carries
 * `?whoislisteningwiththevoiceofthegarden=<key>` and `<key>` is an unexpired
 * row of the `remote_key` table ($lib/server/remoteKeys).
 *
 * Unlike the door (./door.server), whose phrase is fixed and can be checked
 * anywhere, a key can only be checked against the database, which the edge
 * gate (./edge) can't reach. So a navigation carrying a key is not opened at
 * the edge: it is sent to UNLOCK_PATH (src/routes/unlock), a SvelteKit route
 * that checks the key, hands out a pass and an upload draft as a tap would,
 * and sends the visitor on to the page they asked for, without the key. Letting
 * the request through to its own path instead would open static files (scans,
 * audio), which the CDN answers without ever asking SvelteKit, to any value at
 * all.
 *
 * Server-only, like the door, and imports nothing, so the edge bundle can load
 * it by relative path through ./gate.
 */

export const KEY_PARAM = 'whoislisteningwiththevoiceofthegarden';

/** The route that checks a key; always open at the gate. */
export const UNLOCK_PATH = '/unlock';

/** UNLOCK_PATH's own parameters: the key, and where to go once it opens. */
export const UNLOCK_KEY_PARAM = 'key';
export const UNLOCK_TO_PARAM = 'to';

/** Longer than any key worth typing; anything past it is refused unread. */
export const MAX_KEY_LENGTH = 200;

/** True when a query string carries the key parameter, whatever its value. */
export function carriesKey(search: string): boolean {
	return new URLSearchParams(search).has(KEY_PARAM);
}

/** The path, query and hash of `url` less the key parameter and any bare `?`. */
export function withoutKey(url: URL): string {
	const params = new URLSearchParams(url.search);
	params.delete(KEY_PARAM);
	const query = params.toString();
	return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
}

/**
 * Where to send a navigation that carries a key: UNLOCK_PATH, with the key and
 * the page it was meant for. A client-side data load (`/x/__data.json`) is
 * sent on to its page, `/x`, since that is what the visitor navigated to.
 */
export function unlockUrl(url: URL): string {
	const to = new URL(withoutKey(url), url);
	to.pathname = to.pathname.replace(/\/__data\.json$/, '') || '/';
	to.searchParams.delete('x-sveltekit-invalidated');
	to.searchParams.delete('x-sveltekit-trailing-slash');
	const params = new URLSearchParams({
		[UNLOCK_KEY_PARAM]: new URLSearchParams(url.search).get(KEY_PARAM) ?? '',
		[UNLOCK_TO_PARAM]: `${to.pathname}${to.search}${to.hash}`
	});
	return `${UNLOCK_PATH}?${params}`;
}

/**
 * The key as typed, ready to look up: trimmed, or null when it is empty or
 * longer than MAX_KEY_LENGTH.
 */
export function readKey(value: string | null): string | null {
	const key = value?.trim() ?? '';
	return key && key.length <= MAX_KEY_LENGTH ? key : null;
}

/**
 * Where UNLOCK_PATH may send the visitor: `to` if it is a path on this site,
 * else `/`, and without a key of its own. Never another origin, so the route can't be used as an open
 * redirect (`//evil.test`, `/\evil.test` and absolute URLs all resolve
 * elsewhere and are refused).
 */
export function returnPath(to: string | null, origin: string): string {
	if (!to?.startsWith('/')) return '/';
	let target: URL;
	try {
		target = new URL(to, origin);
	} catch {
		return '/';
	}
	if (target.origin !== origin) return '/';
	target.searchParams.delete(KEY_PARAM);
	return `${target.pathname}${target.search}${target.hash}`;
}
