// The whole-site access gate, as Vercel Routing Middleware (Vercel finds it by
// this file name, at the project root). It runs before the CDN cache, so it also
// guards what never reaches SvelteKit: static scans and audio, and cached
// responses like /api/dataset. The logic lives in src/lib/access (typed and
// tested there); this file only binds it to paths and the platform.
//
// It never reads a request's body, so vercel.json sets
// `skipMiddlewareRequestBody`: uploads go to their function without passing
// through here first.
//
// The excluded paths are always open anyway (OPEN_PREFIXES in
// src/lib/access/gate.ts, which a spec keeps in step with this matcher);
// excluding them just skips an invocation for every bundle and decor request,
// each of which Vercel bills as function time.
//
// Imports by relative path, not $lib: Vercel bundles this file on its own,
// outside SvelteKit's build.
//
// The `middleware.ts` file convention, not `proxy.entrypoint` in vercel.json:
// a Vercel CLI older than the `proxy` option builds the site without the gate,
// silently, while every CLI builds this one.
// The middleware helpers alone, not the package's root: keeps the bundle small.
import { next } from '@vercel/functions/middleware';
import { gateRequest, readCookie } from './src/lib/access/edge.ts';

export default async function middleware(request: Request): Promise<Response> {
	try {
		const locked = await gateRequest(
			request,
			(name) => readCookie(request, name),
			process.env.BETTER_AUTH_SECRET
		);
		return locked ?? next();
	} catch (e) {
		// A thrown error must lock, never open: fail the request rather than
		// let it through to the cache or the app ungated.
		console.error('[access-gate] failed', e);
		return new Response('Access check failed', {
			status: 500,
			headers: { 'cache-control': 'no-store' }
		});
	}
}

export const config = {
	// Everything except the always-open prefixes above. Kept a literal: Vercel
	// reads it from the source at build time.
	matcher: ['/((?!_app/|drawing/|clouds/|email/|favicon\\.png$).*)'],
	// Stated, not left to the default, which has changed before: the gate needs
	// only Web Crypto, but runs the same everywhere this way.
	runtime: 'nodejs'
};
