import { error, redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
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

export const handle: Handle = sequence(handleBetterAuth, guardKeeper);
