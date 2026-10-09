/**
 * The keeper sign-in page (/keeper) is closed to visitors without an access
 * pass, like the rest of the site, except through this door: the same page
 * with `?listeningwith=thevoiceofthegarden` in its URL. Keepers bookmark that
 * link; nobody else is shown it. It is a shared phrase, not a credential (the
 * one-time code emailed to an existing account is what signs anyone in), but it
 * keeps the sign-in page from being a way round the garden tag.
 *
 * Server-only (the `.server` suffix makes SvelteKit refuse to bundle it for the
 * browser), so the phrase never ships in the public JS. Imports nothing, so
 * the edge bundle can load it by relative path through ./gate.
 */

export const KEEPER_DOOR_PARAM = 'listeningwith';
const KEEPER_DOOR_PHRASE = 'thevoiceofthegarden';

/** The sign-in page, opened through the door. */
export const KEEPER_DOOR_URL = `/keeper?${KEEPER_DOOR_PARAM}=${KEEPER_DOOR_PHRASE}`;

/**
 * True when a query string carries the door phrase. Case-insensitive in the
 * value, since a phone's keyboard may capitalise a hand-typed link.
 */
export function opensKeeperDoor(search: string): boolean {
	const value = new URLSearchParams(search).get(KEEPER_DOOR_PARAM);
	return value?.toLowerCase() === KEEPER_DOOR_PHRASE;
}
