import { accessDecision, LOCKED_PATH } from './gate.ts';
import { PASS_COOKIE, verifyPass } from './pass.ts';

/**
 * The access gate as it runs at Netlify's edge (netlify/edge-functions/
 * access-gate.ts is only the shell that binds it to paths and the runtime).
 * Kept here, under src/, so it is type-checked and unit-tested with the rest.
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
