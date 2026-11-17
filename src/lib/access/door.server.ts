/**
 * The door: a way into the archive without tapping the garden's NFC tag. Any
 * page of the site opens to a visitor without an access pass when its URL
 * carries `?listeningwith=thevoiceofthegarden`. Keepers bookmark the sign-in
 * page through it (KEEPER_DOOR_URL); nobody else is shown it.
 *
 * Walking through the door is a tap in all but name: SvelteKit hands the
 * visitor a pass (kind `d`, see ./pass) and an upload draft, then sends them on
 * to the same URL without the phrase (hooks.server.ts), so the rest of the site
 * opens behind it and the phrase does not linger in the address bar or history.
 * It is a shared phrase, not a credential: signing in as a keeper still takes
 * the one-time code emailed to an existing account.
 *
 * Server-only (the `.server` suffix makes SvelteKit refuse to bundle it for the
 * browser), so the phrase never ships in the public JS. Imports nothing, so
 * the edge bundle can load it by relative path through ./gate.
 */

export const DOOR_PARAM = 'listeningwith';
const DOOR_PHRASE = 'thevoiceofthegarden';

/** The keeper sign-in page, opened through the door. */
export const KEEPER_DOOR_URL = `/keeper?${DOOR_PARAM}=${DOOR_PHRASE}`;

/**
 * True when a query string carries the door phrase. Case-insensitive in the
 * value, since a phone's keyboard may capitalize a hand-typed link.
 */
export function opensDoor(search: string): boolean {
	const value = new URLSearchParams(search).get(DOOR_PARAM);
	return value?.toLowerCase() === DOOR_PHRASE;
}

/**
 * Where to send a visitor who came through the door: the same path and query,
 * less the door parameter (whatever its value) and any trailing bare `?`.
 */
export function withoutDoor(url: URL): string {
	const params = new URLSearchParams(url.search);
	params.delete(DOOR_PARAM);
	const query = params.toString();
	return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
}
