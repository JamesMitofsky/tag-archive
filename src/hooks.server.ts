import { error, redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { accessDecision, LOCKED_PATH } from '$lib/access/gate';
import { auth } from '$lib/server/auth';
import { keeperPass, readPass } from '$lib/server/access';
import { anonymousKeeperAccess } from '$lib/server/keeperGuard';
import { svelteKitHandler } from 'better-auth/svelte-kit';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	// A transient DB hiccup while reading the session must not 500 the whole
	// request — treat it as "not signed in" for this request and move on. The
	// cookie is left intact, so the next request can recover the session.
	let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
	try {
		session = await auth.api.getSession({ headers: event.request.headers });
	} catch (e) {
		console.error('[hooks] getSession failed', e);
	}

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

// The site-wide access gate (see $lib/access/gate): the site opens to holders
// of an access pass — earned by tapping the garden's NFC tag, or kept topped up
// for a signed-in keeper. In production the edge function has already turned
// pass-less requests away; this is the same rule again for everything that
// reaches SvelteKit, and the only gate under `vite dev`.
const guardAccess: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	let pass = await readPass(event.cookies);
	if (event.locals.user) pass = await keeperPass(event.cookies, pass);
	event.locals.pass = pass ?? undefined;
	if (pass) return resolve(event);

	const isEnhancedAction = event.request.headers.get('x-sveltekit-action') === 'true';
	const decision = accessDecision({
		pathname: event.url.pathname,
		method: event.request.method,
		accept: event.request.headers.get('accept'),
		isDataRequest: event.isDataRequest,
		isEnhancedAction
	});
	if (decision === 'open') return resolve(event);
	// SvelteKit serialises a redirect thrown here correctly for client-side data
	// loads and enhanced form actions too, so those land on the locked page
	// rather than an error.
	if (decision === 'redirect' || event.isDataRequest || isEnhancedAction) {
		throw redirect(303, LOCKED_PATH);
	}
	throw error(401, 'Return to the Cube to re-open the Archive');
};

// The keeper sign-in gate (see $lib/server/keeperGuard): anonymous requests into
// /keeper/* never reach route code.
const guardKeeper: Handle = async ({ event, resolve }) => {
	if (event.locals.user) return resolve(event);

	const access = anonymousKeeperAccess({
		pathname: event.url.pathname,
		method: event.request.method,
		isDataRequest: event.isDataRequest,
		accept: event.request.headers.get('accept'),
		isEnhancedAction: event.request.headers.get('x-sveltekit-action') === 'true'
	});
	if (access === 'redirect') throw redirect(303, '/keeper');
	if (access === 'refuse') throw error(401, 'Sign in to continue');
	return resolve(event);
};

export const handle: Handle = sequence(handleBetterAuth, guardAccess, guardKeeper);
