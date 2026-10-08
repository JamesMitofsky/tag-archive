/**
 * The one-shot message a tap leaves for the page it redirects to (see
 * src/routes/t). A plain, script-readable cookie rather than a query string, so
 * the landing URL stays clean, and read client-side so no page needs a server
 * load (or loses its caching) just to show it.
 */
export const TAP_FLASH_COOKIE = 'tag_tap';

export type TapFlash = 'ok' | 'used' | 'invalid' | 'revoked' | 'busy';

export const TAP_MESSAGES: Record<TapFlash, string> = {
	ok: 'Welcome in — the archive is open to you for the next three hours.',
	used: 'That tap has already been used. Tap the tag again to come in.',
	invalid: 'That tap couldn’t be read. Hold your phone to the tag and try again.',
	revoked: 'That tag is no longer in use.',
	busy: 'Lots of taps just now — wait a moment and try again.'
};

/** Read the flash cookie and clear it, so it shows exactly once. */
export function takeTapFlash(): TapFlash | null {
	const match = document.cookie.match(new RegExp(`(?:^|; )${TAP_FLASH_COOKIE}=([^;]*)`));
	if (!match) return null;
	document.cookie = `${TAP_FLASH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
	const value = decodeURIComponent(match[1]);
	return value in TAP_MESSAGES ? (value as TapFlash) : null;
}
