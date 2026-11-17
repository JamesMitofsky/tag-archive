import { accessDecision, LOCKED_PATH } from './gate.ts';
import { PASS_COOKIE, verifyPass } from './pass.ts';

/**
 * The value of cookie `name` on `request`, or undefined. Routing Middleware
 * gets a bare `Request`, with no cookie helper, so this reads the header the
 * way SvelteKit's own parser (the `cookie` package) does: pairs split on `;`,
 * the first `=` ends the name, surrounding quotes dropped, the value
 * percent-decoded where it can be. The first pair with the name wins, as there.
 */
export function readCookie(request: Request, name: string): string | undefined {
	const header = request.headers.get('cookie');
	if (!header) return undefined;
	for (const pair of header.split(';')) {
		const eq = pair.indexOf('=');
		if (eq === -1 || pair.slice(0, eq).trim() !== name) continue;
		let value = pair.slice(eq + 1).trim();
		if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1);
		}
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}
	return undefined;
}

/**
 * The access gate as it runs in Vercel's Routing Middleware, in front of the
 * CDN cache (the root middleware.ts is only the shell that binds it to paths and
 * the platform). Kept here, under src/, so it is type-checked and unit-tested
 * with the rest.
 *
 * Returns undefined to let the request through to the CDN cache or SvelteKit,
 * or the response that stops it. Locked responses are `no-store`, so no cache
 * between here and the visitor ever keeps one.
 */
export async function gateRequest(
	request: Request,
	cookie: (name: string) => string | undefined,
	secret: string | undefined,
	now = Date.now()
): Promise<Response | undefined> {
	const url = new URL(request.url);
	const isDataRequest = url.pathname.endsWith('/__data.json');
	const decision = accessDecision({
		pathname: url.pathname,
		search: url.search,
		method: request.method,
		accept: request.headers.get('accept'),
		isDataRequest,
		isEnhancedAction: request.headers.get('x-sveltekit-action') === 'true'
	});
	if (decision === 'open') return undefined;

	// No secret means no pass can be checked: everything but the open paths stays
	// locked (fail closed), and the keeper sign-in still works.
	if (!secret) console.error('[access-gate] BETTER_AUTH_SECRET is not set');
	if (await verifyPass(secret ?? '', cookie(PASS_COOKIE), now)) return undefined;

	const headers = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
	if (decision === 'redirect') {
		return new Response(null, {
			status: 303,
			headers: { ...headers, location: LOCKED_PATH }
		});
	}
	return Response.json(
		{ message: 'Visit the Cube to open the Archive', code: 'locked' },
		{ status: 401, headers }
	);
}
