/**
 * The one-shot message a tap leaves for the page it redirects to (see
 * src/routes/t). A plain, script-readable cookie rather than a query string, so
 * the landing URL stays clean, and read client-side so no page needs a server
 * load (or loses its caching) just to show it.
 */
export const TAP_FLASH_COOKIE = 'tag_tap';

export type TapFlash = 'ok' | 'used' | 'invalid' | 'revoked' | 'busy';

export const TAP_MESSAGES: Record<TapFlash, string> = {
	ok: 'Archive opened',
	used: 'That way in has already been used. Return to the Cube to re-open the Archive.',
	invalid: 'The Cube couldn’t hear you. Hold your phone to it and try again.',
	revoked: 'That way into the Archive has closed.',
	busy: 'The Cube is busy just now — wait a moment and try again.'
};

/** Read the flash cookie and clear it, so it shows exactly once. */
export function takeTapFlash(): TapFlash | null {
	const match = document.cookie.match(new RegExp(`(?:^|; )${TAP_FLASH_COOKIE}=([^;]*)`));
	if (!match) return null;
	document.cookie = `${TAP_FLASH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
	const value = decodeURIComponent(match[1]);
	return value in TAP_MESSAGES ? (value as TapFlash) : null;
}
