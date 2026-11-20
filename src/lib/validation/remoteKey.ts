import { check, defineSuite, isFullDate, str } from './helpers';

/**
 * The admin form for unlock keys (src/routes/keeper/settings/keys). Shared by
 * the server, which is the authority, and the browser, for inline feedback.
 */

/** How long a new key lasts unless the admin picks another date. */
export const DEFAULT_KEY_DAYS = 7;

/**
 * Letters, digits and hyphens, so a key reads cleanly in a link and survives
 * being typed by hand. Stored lowercased: keys match in any case anyway.
 */
export const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const KEY_MIN = 3;
export const KEY_MAX = 64;

export type RemoteKeyData = { key: string; expiresOn: string };
export type ExpiryData = { expiresOn: string };

/** Today's date as `YYYY-MM-DD`, UTC, which is the clock expiry dates are read on. */
export function utcDate(now = new Date(), plusDays = 0): string {
	const day = new Date(now.getTime() + plusDays * 24 * 60 * 60 * 1000);
	return day.toISOString().slice(0, 10);
}

export function parseRemoteKeyForm(fd: FormData): RemoteKeyData {
	return { key: str(fd.get('key')).toLowerCase(), expiresOn: str(fd.get('expiresOn')) };
}

export function parseExpiryForm(fd: FormData): ExpiryData {
	return { expiresOn: str(fd.get('expiresOn')) };
}

function checkExpiry(expiresOn: string, today: string) {
	check('expiresOn', 'Pick a date', expiresOn.length > 0);
	if (!expiresOn) return;
	check('expiresOn', 'Pick a real date', isFullDate(expiresOn));
	// Same-day is fine: a bare date runs through the end of that day.
	check('expiresOn', 'Pick today or a later date', !isFullDate(expiresOn) || expiresOn >= today);
}

/** A new key: a link-friendly value and an expiry date no earlier than today. */
export function createRemoteKeySuite(today = utcDate()) {
	return defineSuite<RemoteKeyData>((data) => {
		const key = data.key ?? '';
		check('key', 'Enter a key', key.length > 0);
		if (key) {
			check(
				'key',
				`Use ${KEY_MIN}–${KEY_MAX} characters`,
				key.length >= KEY_MIN && key.length <= KEY_MAX
			);
			check('key', 'Use only letters, numbers and single hyphens between them', KEY_RE.test(key));
		}
		checkExpiry(data.expiresOn ?? '', today);
	});
}

/** A new expiry date for an existing key. */
export function createExpirySuite(today = utcDate()) {
	return defineSuite<ExpiryData>((data) => {
		checkExpiry(data.expiresOn ?? '', today);
	});
}

/** A short random suffix that makes a key made of a name hard to guess. */
export function randomSuffix(length = 6): string {
	const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'; // no look-alikes (l, 1, o, 0)
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
