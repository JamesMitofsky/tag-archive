import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { TAP_FLASH_COOKIE, type TapFlash } from '$lib/access/flash';
import { LOCKED_PATH } from '$lib/access/gate';
import { readKey, returnPath, UNLOCK_KEY_PARAM, UNLOCK_TO_PARAM } from '$lib/access/key.server';
import { issuePass, readPass } from '$lib/server/access';
import { issueDraft } from '$lib/server/drafts';
import { consume, LIMITS } from '$lib/server/rateLimit';
import { keyOpens } from '$lib/server/remoteKeys';
import type { RequestHandler } from './$types';

// Where a navigation carrying `?whoislisteningwiththevoiceofthegarden=<key>`
// is sent (see $lib/access/key.server): the middleware and hooks.server.ts can't
// check a key, so they redirect here with `key` and `to`, the page it was for.
// An unexpired key opens the site as a tap does (/t) — a pass, and a draft so
// /contribute works — and goes on to `to`. Always answers with a redirect, so
// the key never lingers in the address bar or history; the outcome rides along
// in the same one-shot cookie a tap uses.
export const GET: RequestHandler = async ({ url, cookies, getClientAddress, setHeaders }) => {
	setHeaders({
		'cache-control': 'no-store',
		'referrer-policy': 'no-referrer',
		'x-robots-tag': 'noindex'
	});

	const to = returnPath(url.searchParams.get(UNLOCK_TO_PARAM), url.origin);

	// Already in (a reload, or a key followed while the site is open): carry on,
	// without spending a database read or a try against the rate limit.
	if (await readPass(cookies)) throw redirect(303, to);

	const flash = (outcome: TapFlash, location: string): never => {
		cookies.set(TAP_FLASH_COOKIE, outcome, {
			path: '/',
			httpOnly: false, // read once by the client, then cleared
			sameSite: 'lax',
			secure: !dev,
			maxAge: 60
		});
		throw redirect(303, location);
	};

	if (!(await consume('unlock-ip', getClientAddress(), LIMITS.unlockPerIp))) {
		return flash('busy', LOCKED_PATH);
	}

	const key = readKey(url.searchParams.get(UNLOCK_KEY_PARAM));
	if (key && (await keyOpens(key))) {
		await issuePass(cookies, 'r');
		issueDraft(cookies);
		return flash('ok', to);
	}

	// An unknown key and an expired one read the same, so a guess learns nothing
	// about which keys were ever handed out.
	return flash('revoked', LOCKED_PATH);
};
