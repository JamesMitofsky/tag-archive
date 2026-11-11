/**
 * Paths the client needs from the access gate. Kept apart from ./gate so the
 * browser bundle never pulls in the gate, and with it the keeper door phrase
 * (./keeperDoor.server). ./gate imports these same constants, so the two sides
 * can never disagree about which path is which.
 */

/** Where a locked page view is sent. */
export const LOCKED_PATH = '/locked';

/** The keeper sign-in page (and the prefix of the signed-in keeper area). */
export const KEEPER_PATH = '/keeper';

/** The public contribution forms (artefacts here, photographs beneath it), whose actions guard themselves (see ./gate). */
export const CONTRIBUTE_PATH = '/contribute';

/**
 * The presence beat: a body-less POST that re-mints the visitor's pass while
 * the site is on their screen (see ./presence and src/routes/api/presence).
 */
export const PRESENCE_PATH = '/api/presence';

/**
 * How often the page beats while visible. Well under the pass's lifetime
 * (PASS_TTL_MS in ./pass; pass.spec.ts pins the ratio), so a beat or two lost
 * to a flaky garden signal does not shut the site on someone still reading it.
 */
export const PRESENCE_INTERVAL_MS = 4 * 60 * 1000;

/**
 * Where a lapsed pass must NOT send the visitor to the locked page. Under
 * /contribute the form's own action refuses with "tap again" and keeps what
 * was typed; under /keeper a 401 means a lapsed keeper session, which the
 * keeper guard handles on the next navigation (see $lib/server/keeperGuard).
 */
export const KEEPS_WORK_WHEN_LOCKED = [CONTRIBUTE_PATH, KEEPER_PATH];

/** True when `pathname` is `prefix` itself or a path beneath it. */
export function isUnder(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
