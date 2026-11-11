import { error } from '@sveltejs/kit';
import { touchPass } from '$lib/server/access';
import type { RequestHandler } from './$types';

/**
 * The presence beat: the browser POSTs here while the site is on the visitor's
 * screen (every PRESENCE_INTERVAL_MS, plus once as the page goes hidden, see
 * $lib/access/presence), and each beat re-mints the access pass for another
 * PASS_TTL_MS. The site therefore drifts shut that long after it was last
 * visible — a clock the server keeps, since a backgrounded mobile tab cannot.
 *
 * The gate leaves this path open ($lib/access/gate) so a signed-in keeper whose
 * pass has lapsed still reaches hooks.server.ts, which hands them a new one; so
 * the refusal of anyone without a pass lives here. 401 is what the client looks
 * for: it means the archive has drifted shut.
 *
 * Deliberately cheap: one HMAC verify (hooks) and one sign; no database (the
 * rate limiter would cost a write per beat; a keeper's beat already pays the
 * session read hooks make for every request). Not a CSRF surface: a body-less
 * `sendBeacon`/`fetch` carries no form content type, so SvelteKit's origin check
 * does not apply, but the pass cookie is SameSite=Lax and so never rides a
 * cross-site POST — and all a forged beat could do is slide a pass the browser
 * already holds.
 */
export const POST: RequestHandler = async ({ locals, cookies, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });
	if (!locals.pass) throw error(401, 'Visit the Cube to open the Archive');
	await touchPass(cookies, locals.pass);
	return new Response(null, { status: 204 });
};
