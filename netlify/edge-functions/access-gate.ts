// The whole-site access gate, at Netlify's edge: it runs before the CDN cache,
// so it also guards what never reaches SvelteKit — static scans and audio, and
// cached responses like /api/dataset. The logic lives in src/lib/access (typed
// and tested there); this file only binds it to paths and the Deno runtime.
//
// The excluded paths are always open anyway (OPEN_PREFIXES in
// src/lib/access/gate.ts, which a spec keeps in step with this list); excluding
// them just skips an invocation for every bundle and decor request.
import { gateRequest } from '../../src/lib/access/edge.ts';

type Context = { cookies: { get(name: string): string | undefined } };
declare const Netlify: { env: { get(name: string): string | undefined } };

export default (request: Request, context: Context) =>
	gateRequest(request, (name) => context.cookies.get(name), Netlify.env.get('BETTER_AUTH_SECRET'));

export const config = {
	path: '/*',
	excludedPath: ['/_app/*', '/drawing/*', '/clouds/*', '/email/*', '/favicon.png'],
	// A thrown error must lock, never open: fail the request rather than bypass.
	onError: 'fail'
};
