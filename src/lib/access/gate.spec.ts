import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import middleware, { config } from '../../../middleware';
import { DOOR_PARAM, KEEPER_DOOR_URL, opensDoor, withoutDoor } from './door.server';
import { gateRequest, readCookie } from './edge';
import { accessDecision, isDoorNavigation, isKeyNavigation, isOpenPath, LOCKED_PATH } from './gate';
import { KEY_PARAM, returnPath, UNLOCK_PATH, unlockUrl, withoutKey } from './key.server';
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
		'/unlock',
		'/api/presence',
		'/keeper',
		'/keeper/',
		'/keeper/__data.json',
		'/keeper/artefacts/3',
		'/api/auth/sign-in/email-otp',
		'/api/cron/sweep-submissions',
		'/_app/immutable/entry/start.js',
		'/drawing/text/tag-archive.webp',
		'/clouds/cloud-1.webp',
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

	describe('the door', () => {
		const door = new URL(KEEPER_DOOR_URL, 'https://archive.test').search;
		const at = (
			pathname: string,
			search: string,
			{ method = 'GET', accept = 'text/html', isDataRequest = false, isEnhancedAction = false } = {}
		) => accessDecision({ pathname, search, method, accept, isDataRequest, isEnhancedAction });

		it('is not needed for the sign-in page, however the path is spelled', () => {
			expect(at('/keeper', '')).toBe('open');
			expect(at('/keeper/', '')).toBe('open');
			expect(at('/keeper/__data.json', '', { accept: '*/*', isDataRequest: true })).toBe('open');
			// Its actions too: asking for a code, entering it, and asking again.
			expect(at('/keeper', '?/sendOtp', { method: 'POST', isEnhancedAction: true })).toBe('open');
			expect(at('/keeper', '?/verifyOtp', { method: 'POST' })).toBe('open');
		});

		it.each([
			'/',
			'/events',
			'/events/3',
			'/contribute',
			'/meditation-walk',
			'/keeper',
			'/keeper/'
		])('opens a page view of %s', (path) => {
			expect(at(path, door)).toBe('open');
			expect(at(path, door, { method: 'HEAD' })).toBe('open');
			expect(at(path, `?q=clouds&${door.slice(1)}`)).toBe('open');
		});

		it('opens a client-side navigation, whose data load keeps the query string', () => {
			const load = { accept: '*/*', isDataRequest: true };
			expect(at('/events/__data.json', `${door}&x-sveltekit-invalidated=01`, load)).toBe('open');
			expect(at('/keeper/__data.json', door, load)).toBe('open');
		});

		it('takes the phrase in any case, but only the phrase', () => {
			const shouted = door.toUpperCase().replace(DOOR_PARAM.toUpperCase(), DOOR_PARAM);
			expect(at('/events', shouted)).toBe('open');
			expect(at('/events', `?${DOOR_PARAM}=thewindinthetrees`)).toBe('redirect');
			expect(at('/events', `?${DOOR_PARAM}=`)).toBe('redirect');
			expect(at('/events', `?${DOOR_PARAM.toUpperCase()}=thevoiceofthegarden`)).toBe('redirect');
		});

		it('opens no fetch, file or write: those need the pass the navigation hands out', () => {
			expect(at('/api/dataset', door, { accept: '*/*' })).toBe('refuse');
			expect(at('/artefacts/TAG-001.jpg', door, { accept: 'image/*' })).toBe('refuse');
			expect(at('/events', door, { method: 'POST' })).toBe('refuse');
			expect(
				at('/events', `?/search&${door.slice(1)}`, { method: 'POST', isEnhancedAction: true })
			).toBe('refuse');
		});

		it('names exactly the requests hooks.server.ts answers with a pass', () => {
			const request = (search: string, extra = {}) => ({
				pathname: '/events',
				search,
				method: 'GET',
				accept: 'text/html',
				isDataRequest: false,
				...extra
			});
			expect(isDoorNavigation(request(door))).toBe(true);
			expect(isDoorNavigation(request(door, { accept: '*/*', isDataRequest: true }))).toBe(true);
			expect(isDoorNavigation(request(''))).toBe(false);
			expect(isDoorNavigation(request(door, { accept: 'application/json' }))).toBe(false);
			expect(isDoorNavigation(request(door, { method: 'POST' }))).toBe(false);
		});

		it('leads on to the same URL without the phrase', () => {
			const strip = (path: string) => withoutDoor(new URL(path, 'https://archive.test'));
			expect(strip(KEEPER_DOOR_URL)).toBe('/keeper');
			expect(strip(`/events/3${door}`)).toBe('/events/3');
			expect(strip(`/events?q=clouds&${door.slice(1)}&page=2#map`)).toBe(
				'/events?q=clouds&page=2#map'
			);
			expect(strip(`/${door.toUpperCase().replace(DOOR_PARAM.toUpperCase(), DOOR_PARAM)}`)).toBe(
				'/'
			);
			expect(opensDoor(new URL(strip(`/events${door}`), 'https://archive.test').search)).toBe(
				false
			);
		});
	});

	describe('unlock keys', () => {
		const key = `?${KEY_PARAM}=tobyshorin`;
		const at = (
			pathname: string,
			search: string,
			{ method = 'GET', accept = 'text/html', isDataRequest = false, isEnhancedAction = false } = {}
		) => accessDecision({ pathname, search, method, accept, isDataRequest, isEnhancedAction });

		it.each(['/', '/events', '/events/3', '/artefacts/TAG-001.jpg'])(
			'sends a page view of %s to be unlocked, whatever the key, never straight through',
			(path) => {
				// The key is unchecked here, and the path may be a static file the CDN
				// would serve without asking SvelteKit: opening it would open the file.
				expect(at(path, key)).toBe('unlock');
				expect(at(path, `?${KEY_PARAM}=anything`, { method: 'HEAD' })).toBe('unlock');
				expect(at(path, `?${KEY_PARAM}=`)).toBe('unlock');
				expect(at(path, `?q=clouds&${key.slice(1)}`)).toBe('unlock');
			}
		);

		it('lets a data load on to SvelteKit, which always answers it', () => {
			const load = { accept: '*/*', isDataRequest: true };
			expect(at('/events/__data.json', `${key}&x-sveltekit-invalidated=01`, load)).toBe('open');
		});

		it('opens no fetch, file or write, and reads the parameter name exactly', () => {
			expect(at('/api/dataset', key, { accept: '*/*' })).toBe('refuse');
			expect(at('/artefacts/TAG-001.jpg', key, { accept: 'image/*' })).toBe('refuse');
			expect(at('/events', key, { method: 'POST' })).toBe('refuse');
			expect(at('/events', `?${KEY_PARAM.toUpperCase()}=tobyshorin`)).toBe('redirect');
		});

		it('names exactly the requests hooks.server.ts sends on to /unlock', () => {
			const request = (search: string, extra = {}) => ({
				pathname: '/events',
				search,
				method: 'GET',
				accept: 'text/html',
				isDataRequest: false,
				...extra
			});
			expect(isKeyNavigation(request(key))).toBe(true);
			expect(isKeyNavigation(request(key, { accept: '*/*', isDataRequest: true }))).toBe(true);
			expect(isKeyNavigation(request(''))).toBe(false);
			expect(isKeyNavigation(request(key, { accept: 'application/json' }))).toBe(false);
			expect(isKeyNavigation(request(key, { method: 'POST' }))).toBe(false);
		});

		it('sends the key and the page it was for to /unlock, which reads neither as a key', () => {
			const unlock = (path: string) => unlockUrl(new URL(path, 'https://archive.test'));
			const read = (path: string) => new URL(unlock(path), 'https://archive.test');

			const url = read(`/events?q=clouds&${KEY_PARAM}=Toby%20Shorin&page=2`);
			expect(url.pathname).toBe(UNLOCK_PATH);
			expect(url.searchParams.get('key')).toBe('Toby Shorin');
			expect(url.searchParams.get('to')).toBe('/events?q=clouds&page=2');
			// /unlock itself must not look like a key navigation, or it would loop.
			expect(url.searchParams.has(KEY_PARAM)).toBe(false);

			expect(read(`/${key}`).searchParams.get('to')).toBe('/');
			const load = read(`/events/__data.json${key}&x-sveltekit-invalidated=01`);
			expect(load.searchParams.get('to')).toBe('/events');
		});

		it('leads a visitor already holding a pass on to the same URL without the key', () => {
			const strip = (path: string) => withoutKey(new URL(path, 'https://archive.test'));
			expect(strip(`/events/3${key}`)).toBe('/events/3');
			expect(strip(`/events?q=clouds&${key.slice(1)}#map`)).toBe('/events?q=clouds#map');
		});

		it('only ever returns to a path on this site', () => {
			const origin = 'https://archive.test';
			expect(returnPath('/events?q=clouds', origin)).toBe('/events?q=clouds');
			expect(returnPath(`/events?${KEY_PARAM}=again`, origin)).toBe('/events');
			for (const to of [
				null,
				'',
				'events',
				'//evil.test/x',
				'/\\evil.test/x',
				'https://evil.test/x',
				'javascript:alert(1)'
			]) {
				expect(returnPath(to, origin), String(to)).toBe('/');
			}
		});
	});

	it('is not fooled by look-alike paths', () => {
		expect(isOpenPath('/keeperx')).toBe(false);
		expect(isOpenPath('/keeperx/__data.json')).toBe(false);
		expect(isOpenPath('/keeper')).toBe(true);
		expect(isOpenPath('/keeper/')).toBe(true);
		expect(isOpenPath('/keeper/__data.json')).toBe(true);
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
			'/keeperx',
			'/api/dataset',
			'/api/scans',
			'/email/logo.png',
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

	it('fails closed without a secret, but keeps sign-in reachable', async () => {
		const { token } = await mintPass(SECRET, 't');
		expect((await gateRequest(request('/'), () => token, undefined))?.status).toBe(303);
		expect(await gateRequest(request('/keeper'), () => undefined, undefined)).toBeUndefined();
		expect(await gateRequest(request(KEEPER_DOOR_URL), () => undefined, undefined)).toBeUndefined();
	});

	it('opens the keeper sign-in page without a pass, door or no door', async () => {
		expect(await gateRequest(request('/keeper'), () => undefined, SECRET)).toBeUndefined();
		expect(await gateRequest(request(KEEPER_DOOR_URL), () => undefined, SECRET)).toBeUndefined();
	});

	it('lets a page view through the door on to SvelteKit, on any path', async () => {
		const door = new URL(KEEPER_DOOR_URL, 'https://archive.test').search;
		expect(await gateRequest(request(`/events${door}`), () => undefined, SECRET)).toBeUndefined();
		expect(
			await gateRequest(request(`/events/__data.json${door}`, '*/*'), () => undefined, SECRET)
		).toBeUndefined();
		const fetched = await gateRequest(
			request(`/api/dataset${door}`, '*/*'),
			() => undefined,
			SECRET
		);
		expect(fetched?.status).toBe(401);
	});

	it('sends a page view carrying a key to /unlock, uncacheably and without a referrer', async () => {
		const res = await gateRequest(
			request(`/artefacts/TAG-001.jpg?${KEY_PARAM}=tobyshorin`),
			() => undefined,
			SECRET
		);
		expect(res?.status).toBe(303);
		const location = new URL(res?.headers.get('location') ?? '', 'https://archive.test');
		expect(location.pathname).toBe(UNLOCK_PATH);
		expect(location.searchParams.get('to')).toBe('/artefacts/TAG-001.jpg');
		expect(res?.headers.get('cache-control')).toBe('no-store');
		expect(res?.headers.get('referrer-policy')).toBe('no-referrer');
	});

	it('lets a key through for a visitor already holding a pass', async () => {
		const { token } = await mintPass(SECRET, 'r');
		expect(
			await gateRequest(request(`/events?${KEY_PARAM}=tobyshorin`), () => token, SECRET)
		).toBeUndefined();
	});

	it('leaves /unlock itself open', async () => {
		expect(
			await gateRequest(request(`${UNLOCK_PATH}?key=tobyshorin&to=/`), () => undefined, SECRET)
		).toBeUndefined();
	});
});

describe('middleware as Vercel builds it', () => {
	// Vercel builds middleware.ts outside Vite: it compiles each file of the
	// gate on its own, with the project's tsconfig, and ships it as .js, leaving
	// import paths as written. Node then loads those paths as they are, so each
	// relative import must name the shipped .js file of a .ts source. A .ts or
	// extensionless path names a file the deployment does not have, and every
	// request fails with MIDDLEWARE_INVOCATION_FAILED (see middleware.ts).
	// This walks the gate's relative imports through the same per-file compile.
	const root = path.resolve(import.meta.dirname, '../../..');
	const { config: raw } = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
	const { options } = ts.parseJsonConfigFileContent(raw, ts.sys, root);

	const relativeImports = (code: string) =>
		ts
			.preProcessFile(code, true, true)
			.importedFiles.map((file) => file.fileName)
			.filter((name) => name.startsWith('./') || name.startsWith('../'));

	it('imports every file of the gate by the .js name it ships under', () => {
		const seen = new Set<string>();
		const queue = [path.join(root, 'middleware.ts')];
		while (queue.length > 0) {
			const file = queue.pop()!;
			if (seen.has(file)) continue;
			seen.add(file);

			const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
				compilerOptions: options,
				fileName: file
			});
			for (const specifier of relativeImports(outputText)) {
				const where = `${path.relative(root, file)} imports ${specifier}`;
				expect(specifier, where).toMatch(/\.js$/);
				const source = path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts'));
				expect(existsSync(source), `${where}, but there is no ${path.relative(root, source)}`).toBe(
					true
				);
				queue.push(source);
			}
		}
		// The walk covered the whole gate, not just the entry file.
		expect([...seen].map((file) => path.relative(root, file)).sort()).toEqual([
			'middleware.ts',
			'src/lib/access/door.server.ts',
			'src/lib/access/edge.ts',
			'src/lib/access/gate.ts',
			'src/lib/access/key.server.ts',
			'src/lib/access/pass.ts',
			'src/lib/access/paths.ts'
		]);
	});
});
