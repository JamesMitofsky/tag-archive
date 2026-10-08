import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { LOCKED_PATH } from '$lib/access/gate';
import { TAP_FLASH_COOKIE, type TapFlash } from '$lib/access/flash';
import { issuePass, readPass } from '$lib/server/access';
import { issueDraft } from '$lib/server/drafts';
import { sdmKeys } from '$lib/server/nfc/keys';
import { verifyTap } from '$lib/server/nfc/sdm';
import { recordTap } from '$lib/server/nfc/taps';
import { consume, LIMITS } from '$lib/server/rateLimit';
import type { RequestHandler } from './$types';

// Where the garden's NFC tag points. Every tap rewrites `e` (the tag's UID and
// tap counter, encrypted) and `c` (a MAC over them) — see $lib/server/nfc/sdm.
// A genuine tap with a counter we haven't seen opens the whole site for a few
// hours ($lib/access/pass) and starts or renews the visitor's upload draft
// ($lib/server/drafts), so contributing needs no further check.
//
// Always answers with a redirect, so the one-time URL never lingers in the
// address bar or history to be copied. The outcome rides along in a short-lived
// cookie the layout turns into a toast.
export const GET: RequestHandler = async ({ url, cookies, getClientAddress, setHeaders }) => {
	setHeaders({
		'cache-control': 'no-store',
		'referrer-policy': 'no-referrer',
		'x-robots-tag': 'noindex'
	});

	const flash = (outcome: TapFlash, to: string): never => {
		cookies.set(TAP_FLASH_COOKIE, outcome, {
			path: '/',
			httpOnly: false, // read once by the client, then cleared
			sameSite: 'lax',
			secure: !dev,
			maxAge: 60
		});
		throw redirect(303, to);
	};

	if (!(await consume('tap-ip', getClientAddress(), LIMITS.tapPerIp))) {
		return flash('busy', LOCKED_PATH);
	}

	const keys = sdmKeys();
	const tap =
		keys && verifyTap({ e: url.searchParams.get('e'), c: url.searchParams.get('c') }, keys);
	if (!tap) return flash('invalid', LOCKED_PATH);

	const outcome = await recordTap(tap.uid, tap.counter);
	if (outcome === 'ok') {
		await issuePass(cookies, 't');
		issueDraft(cookies);
		return flash('ok', '/');
	}

	// A replay from a visitor who is already in — Safari reloading or restoring
	// the tap's tab — is no cause for alarm: carry on as they were.
	if (outcome === 'used' && (await readPass(cookies))) throw redirect(303, '/');
	return flash(outcome, LOCKED_PATH);
};
