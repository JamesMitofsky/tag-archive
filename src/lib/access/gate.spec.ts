import { afterEach, describe, expect, it, vi } from 'vitest';
import middleware, { config } from '../../../middleware';
import { gateRequest, readCookie } from './edge';
import { accessDecision, isOpenPath, LOCKED_PATH } from './gate';
import { KEEPER_DOOR_PARAM, KEEPER_DOOR_URL } from './keeperDoor.server';
import { mintPass, PASS_COOKIE } from './pass';

const page = (pathname: string, method = 'GET') =>
	accessDecision({ pathname, method, accept: 'text/html,*/*', isDataRequest: false });
const fetchCall = (pathname: string, method = 'GET') =>
	accessDecision({ pathname, method, accept: 'application/json', isDataRequest: false });

describe('accessDecision (no pass)', () => {
	it.each([
		'/t',
		'/locked',
		'/locked/',
		'/api/presence',
		'/keeper/artefacts/3',
		'/api/auth/sign-in/email-otp',
		'/api/cron/sweep-submissions',
		'/_app/immutable/entry/start.js',
		'/drawing/text/tag-archive.webp',
		'/clouds/cloud-1.webp',
		'/email/logo.png',
		'/favicon.png'
	])('leaves %s open', (path) => {
		expect(page(path)).toBe('open');
		expect(fetchCall(path, 'POST')).toBe('open');
	});

	it.each([
		'/',
		'/events',
		'/images',
		'/contribute',
		'/contribute/images',
		'/meditation-walk',
		'/demo'
	])('sends a page view of %s to the locked page', (path) => {
		expect(page(path)).toBe('redirect');
		expect(page(path, 'HEAD')).toBe('redirect');
	});

	it.each([
		'/api/dataset',
		'/api/scans',
		'/api/presencex',
		'/artefacts/TAG-001.jpg',
		'/audio/meditation-walk/01%20-%20INTRODUCTION.mp3'
	])('refuses a fetch of %s', (path) => {
		expect(fetchCall(path)).toBe('refuse');
	});

	it('refuses data loads and form posts rather than redirecting them', () => {
		expect(
			accessDecision({ pathname: '/events', method: 'GET', accept: '*/*', isDataRequest: true })
		).toBe('refuse');
		expect(page('/events', 'POST')).toBe('refuse');
	});

	it('lets enhanced form posts to /contribute through, for the action to refuse', () => {
		// So a visitor whose hours lapse mid-entry keeps their form (see gate.ts).
		const post = (pathname: string, isEnhancedAction: boolean) =>
			accessDecision({
				pathname,
				method: 'POST',
				accept: 'application/json',
				isDataRequest: false,
				isEnhancedAction
			});
		expect(post('/contribute', true)).toBe('open');
		// A plain post would render the whole page, load data and all.
		expect(post('/contribute', false)).toBe('refuse');
		expect(page('/contribute', 'POST')).toBe('refuse');
		expect(post('/events', true)).toBe('refuse');
		expect(page('/contribute')).toBe('redirect');
		expect(fetchCall('/contribute/__data.json')).toBe('refuse');
	});

	it('lets enhanced form posts to the forms beneath /contribute through, and only those', () => {
		const post = (pathname: string, isEnhancedAction: boolean) =>
			accessDecision({
				pathname,
				method: 'POST',
				accept: 'application/json',
				isDataRequest: false,
				isEnhancedAction
			});
		// The photograph form keeps its entry when a pass lapses, as /contribute does.
		expect(post('/contribute/images', true)).toBe('open');
		expect(post('/contribute/images/', true)).toBe('open');
		expect(post('/contribute/images', false)).toBe('refuse');
		expect(page('/contribute/images', 'POST')).toBe('refuse');
		// Only its actions guard themselves: the page and its data loads stay locked.
		expect(page('/contribute/images')).toBe('redirect');
		expect(fetchCall('/contribute/images/__data.json')).toBe('refuse');
		// SvelteKit answers a data request with load data whatever its method, so
		// a POST dressed as an action is still a data load. Under hooks the
		// suffix is already stripped from the path, and only the flag tells.
		for (const pathname of [
			'/contribute/__data.json',
			'/contribute/images/__data.json',
			'/contribute',
			'/contribute/images'
		]) {
			const dataPost = accessDecision({
				pathname,
				method: 'POST',
				accept: '*/*',
				isDataRequest: true,
				isEnhancedAction: true
			});
			expect(dataPost, pathname).toBe('refuse');
		}
		// A look-alike path is no form of ours.
		expect(post('/contribute-images', true)).toBe('refuse');
		expect(post('/contributex', true)).toBe('refuse');
		// The public photographs page is gated like every other public page.
		expect(page('/images')).toBe('redirect');
		expect(post('/images', true)).toBe('refuse');
	});

	it('opens an enhanced post only when SvelteKit will answer it with the action result alone', () => {
		// SvelteKit picks that answer from the Accept header, not from
		// `x-sveltekit-action`: one that prefers HTML runs the action and then
		// renders the whole page around its refusal, load data and all.
		const post = (pathname: string, accept: string | null) =>
			accessDecision({
				pathname,
				method: 'POST',
				accept,
				isDataRequest: false,
				isEnhancedAction: true
			});
		for (const pathname of ['/contribute', '/contribute/images']) {
			const at = (accept: string | null) => post(pathname, accept);
			// What `use:enhance` sends.
			expect(at('application/json'), pathname).toBe('open');
			// No header, or no preference, is answered with JSON…
			expect(at(null), pathname).toBe('open');
			expect(at('*/*'), pathname).toBe('open');
			expect(at('application/json,text/html;q=0.9'), pathname).toBe('open');
			// …but an empty header, or one that prefers HTML, gets the page.
			expect(at(''), pathname).toBe('refuse');
			expect(at('text/html'), pathname).toBe('refuse');
			expect(at('text/html,application/json;q=0.9'), pathname).toBe('refuse');
			expect(at('text/html, */*'), pathname).toBe('refuse');
			expect(at('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'), pathname).toBe(
				'refuse'
			);
			// q=0 ranks last but, as SvelteKit reads it, still accepts.
			expect(at('text/html;q=0,application/json'), pathname).toBe('open');
			expect(at('application/json;q=0,text/html'), pathname).toBe('refuse');
			expect(at('application/json;q=0'), pathname).toBe('open');
			expect(at('text/html;q=0'), pathname).toBe('refuse');
		}
	});

	describe('the keeper sign-in page', () => {
		const door = new URL(KEEPER_DOOR_URL, 'https://archive.test').search;
		const at = (
			pathname: string,
			search: string,
			{ method = 'GET', accept = 'text/html', isDataRequest = false, isEnhancedAction = false } = {}
		) => accessDecision({ pathname, search, method, accept, isDataRequest, isEnhancedAction });

		it('is locked without its door, however the path is spelled', () => {
			expect(at('/keeper', '')).toBe('redirect');
			expect(at('/keeper/', '')).toBe('redirect');
			expect(at('/keeper/__data.json', '', { accept: '*/*', isDataRequest: true })).toBe('refuse');
			expect(at('/keeper', '?/sendOtp', { method: 'POST', isEnhancedAction: true })).toBe('refuse');
		});

		it('opens through its door: the page, its data loads and its form actions', () => {
			expect(at('/keeper', door)).toBe('open');
			expect(at('/keeper/', door)).toBe('open');
			expect(at('/keeper/__data.json', `${door}&x-sveltekit-invalidated=01`)).toBe('open');
			expect(
				at('/keeper', `?/sendOtp&${door.slice(1)}`, { method: 'POST', isEnhancedAction: true })
			).toBe('open');
		});

		it('takes the phrase in any case, but only the phrase', () => {
			expect(
				at(
					'/keeper',
					door.toUpperCase().replace(KEEPER_DOOR_PARAM.toUpperCase(), KEEPER_DOOR_PARAM)
				)
			).toBe('open');
			expect(at('/keeper', `?${KEEPER_DOOR_PARAM}=thewindinthetrees`)).toBe('redirect');
			expect(at('/keeper', `?${KEEPER_DOOR_PARAM}=`)).toBe('redirect');
		});

		it('opens nothing else', () => {
			expect(at('/', door)).toBe('redirect');
			expect(at('/keeperx', door)).toBe('redirect');
			expect(at('/api/dataset', door, { accept: '*/*' })).toBe('refuse');
		});
	});

	it('is not fooled by look-alike paths', () => {
		expect(isOpenPath('/keeperx')).toBe(false);
		expect(isOpenPath('/keeper')).toBe(false);
		expect(isOpenPath('/keeper/')).toBe(false);
		expect(isOpenPath('/keeper/__data.json')).toBe(false);
		expect(isOpenPath('/tx')).toBe(false);
		expect(isOpenPath('/lockedx')).toBe(false);
		expect(isOpenPath('/api/authx')).toBe(false);
		expect(isOpenPath('/locked/__data.json')).toBe(true);
		expect(isOpenPath('/events/__data.json')).toBe(false);
	});
});

describe('middleware matcher', () => {
	// As Vercel compiles each matcher: anchored, with one optional trailing
	// `/`, `#` or `?` (see `middlewareRawSrc` in .vercel/output/config.json).
	const matchers = config.matcher.map((m) => new RegExp(`^(?:${m})[/#?]?$`));
	const runsOn = (path: string) => matchers.some((m) => m.test(path));

	it('only skips paths the gate leaves open anyway', () => {
		for (const path of [
			'/_app/immutable/entry/start.js',
			'/_app/version.json',
			'/drawing/text/tag-archive.webp',
			'/clouds/cloud-1.webp',
			'/email/logo.png',
			'/favicon.png'
		]) {
			expect(runsOn(path), path).toBe(false);
			expect(isOpenPath(path), path).toBe(true);
		}
	});

	it('runs on everything the gate may lock, look-alikes included', () => {
		for (const path of [
			'/',
			'/events',
			'/events/__data.json',
			'/keeper',
			'/api/dataset',
			'/api/scans',
			'/artefacts/TAG-001.jpg',
			'/audio/meditation-walk/01%20-%20INTRODUCTION.mp3',
			'/_vercel/image',
			'/_appx',
			'/drawingx/a.webp',
			'/favicon.png.map',
			'/favicon.pngx'
		]) {
			expect(runsOn(path), path).toBe(true);
		}
	});
});

describe('readCookie', () => {
	const withCookie = (cookie?: string) =>
		new Request('https://archive.test/', cookie ? { headers: { cookie } } : undefined);

	it('finds a cookie among others, by its exact name', () => {
		const request = withCookie('a=1; tag_pass=v1.t.1.2.sig; tag_passx=no');
		expect(readCookie(request, 'tag_pass')).toBe('v1.t.1.2.sig');
		expect(readCookie(request, 'tag')).toBeUndefined();
	});

	it('takes the first of two pairs with the same name', () => {
		expect(readCookie(withCookie('tag_pass=first; tag_pass=second'), 'tag_pass')).toBe('first');
	});

	it('decodes the value, drops its quotes, and keeps one it cannot decode', () => {
		expect(readCookie(withCookie('a=%20b'), 'a')).toBe(' b');
		expect(readCookie(withCookie('a="quoted"'), 'a')).toBe('quoted');
		expect(readCookie(withCookie('a=%E0%A4%A'), 'a')).toBe('%E0%A4%A');
		expect(readCookie(withCookie('a=x=y'), 'a')).toBe('x=y');
	});

	it('is undefined without the header or the cookie', () => {
		expect(readCookie(withCookie(), 'a')).toBeUndefined();
		expect(readCookie(withCookie('novalue; b=2'), 'novalue')).toBeUndefined();
	});
});

describe('middleware', () => {
	const SECRET = 'middleware-secret';

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('lets a request with a pass through to the app or the cache', async () => {
		vi.stubEnv('BETTER_AUTH_SECRET', SECRET);
		const { token } = await mintPass(SECRET, 't');
		const res = await middleware(
			new Request('https://archive.test/events', {
				headers: { accept: 'text/html', cookie: `${PASS_COOKIE}=${token}` }
			})
		);
		expect(res.headers.get('x-middleware-next')).toBe('1');
	});

	it('locks a request without one', async () => {
		vi.stubEnv('BETTER_AUTH_SECRET', SECRET);
		const res = await middleware(
			new Request('https://archive.test/events', { headers: { accept: 'text/html' } })
		);
		expect(res.status).toBe(303);
		expect(res.headers.get('x-middleware-next')).toBeNull();
	});

	it('fails closed when the check itself throws', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		// A Request whose URL getter throws stands in for any failure inside the gate.
		const broken = new Proxy(new Request('https://archive.test/events'), {
			get(target, prop) {
				if (prop === 'url') throw new Error('boom');
				return Reflect.get(target, prop, target);
			}
		});
		const res = await middleware(broken);
		expect(res.status).toBe(500);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(res.headers.get('x-middleware-next')).toBeNull();
	});
});

describe('gateRequest (edge)', () => {
	const SECRET = 'edge-secret';
	const request = (path: string, accept = 'text/html') =>
		new Request(`https://archive.test${path}`, { headers: { accept } });

	it('passes through with a valid pass', async () => {
		const { token } = await mintPass(SECRET, 't');
		expect(await gateRequest(request('/api/dataset'), () => token, SECRET)).toBeUndefined();
	});

	it('redirects a page view without a pass, uncacheably', async () => {
		const res = await gateRequest(request('/'), () => undefined, SECRET);
		expect(res?.status).toBe(303);
		expect(res?.headers.get('location')).toBe(LOCKED_PATH);
		expect(res?.headers.get('cache-control')).toBe('no-store');
	});

	it('refuses a fetch without a pass', async () => {
		const res = await gateRequest(request('/api/dataset', '*/*'), () => undefined, SECRET);
		expect(res?.status).toBe(401);
		expect(await res?.json()).toMatchObject({ code: 'locked' });
	});

	it('refuses a client-side data load even when it asks for HTML', async () => {
		const res = await gateRequest(request('/events/__data.json'), () => undefined, SECRET);
		expect(res?.status).toBe(401);
	});

	it('lets an enhanced post to a contribution form through, but not one to its data', async () => {
		const actionPost = (path: string) =>
			new Request(`https://archive.test${path}`, {
				method: 'POST',
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
		expect(
			await gateRequest(actionPost('/contribute/images?/createImageSet'), () => undefined, SECRET)
		).toBeUndefined();
		for (const path of ['/contribute/__data.json', '/contribute/images/__data.json']) {
			const res = await gateRequest(actionPost(path), () => undefined, SECRET);
			expect(res?.status, path).toBe(401);
		}
		// Dressed as an action but asking for HTML: SvelteKit would render the page.
		const htmlPost = new Request('https://archive.test/contribute/images?/createImageSet', {
			method: 'POST',
			headers: { accept: 'text/html', 'x-sveltekit-action': 'true' }
		});
		expect((await gateRequest(htmlPost, () => undefined, SECRET))?.status).toBe(401);
	});

	it('fails closed without a secret, but keeps sign-in reachable through its door', async () => {
		const { token } = await mintPass(SECRET, 't');
		expect((await gateRequest(request('/'), () => token, undefined))?.status).toBe(303);
		expect(await gateRequest(request(KEEPER_DOOR_URL), () => undefined, undefined)).toBeUndefined();
	});

	it('locks the keeper sign-in page without its door', async () => {
		const res = await gateRequest(request('/keeper'), () => undefined, SECRET);
		expect(res?.status).toBe(303);
		expect(res?.headers.get('location')).toBe(LOCKED_PATH);
		expect(await gateRequest(request(KEEPER_DOOR_URL), () => undefined, SECRET)).toBeUndefined();
	});
});
