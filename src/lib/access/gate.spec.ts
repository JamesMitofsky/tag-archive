import { describe, expect, it } from 'vitest';
import { config } from '../../../netlify/edge-functions/access-gate';
import { gateRequest } from './edge';
import { DOOR_PARAM, KEEPER_DOOR_URL, opensDoor, withoutDoor } from './door.server';
import { accessDecision, isDoorNavigation, isOpenPath, LOCKED_PATH } from './gate';
import { mintPass } from './pass';

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

	it.each(['/', '/events', '/contribute', '/meditation-walk', '/demo'])(
		'sends a page view of %s to the locked page',
		(path) => {
			expect(page(path)).toBe('redirect');
			expect(page(path, 'HEAD')).toBe('redirect');
		}
	);

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

	describe('the door', () => {
		const door = new URL(KEEPER_DOOR_URL, 'https://archive.test').search;
		const at = (
			pathname: string,
			search: string,
			{ method = 'GET', accept = 'text/html', isDataRequest = false, isEnhancedAction = false } = {}
		) => accessDecision({ pathname, search, method, accept, isDataRequest, isEnhancedAction });

		it('keeps the sign-in page locked without it, however the path is spelled', () => {
			expect(at('/keeper', '')).toBe('redirect');
			expect(at('/keeper/', '')).toBe('redirect');
			expect(at('/keeper/__data.json', '', { accept: '*/*', isDataRequest: true })).toBe('refuse');
			expect(at('/keeper', '?/sendOtp', { method: 'POST', isEnhancedAction: true })).toBe('refuse');
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
			expect(at('/keeper', `?/sendOtp&${door.slice(1)}`, { method: 'POST' })).toBe('refuse');
			expect(
				at('/keeper', `?/sendOtp&${door.slice(1)}`, { method: 'POST', isEnhancedAction: true })
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

describe('edge function config', () => {
	it('only skips paths the gate leaves open anyway', () => {
		for (const pattern of config.excludedPath) {
			const sample = pattern.replace('*', 'anything');
			expect(isOpenPath(sample), pattern).toBe(true);
		}
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

	it('fails closed without a secret, but keeps sign-in reachable through the door', async () => {
		const { token } = await mintPass(SECRET, 't');
		expect((await gateRequest(request('/'), () => token, undefined))?.status).toBe(303);
		expect(await gateRequest(request(KEEPER_DOOR_URL), () => undefined, undefined)).toBeUndefined();
	});

	it('locks the keeper sign-in page without the door', async () => {
		const res = await gateRequest(request('/keeper'), () => undefined, SECRET);
		expect(res?.status).toBe(303);
		expect(res?.headers.get('location')).toBe(LOCKED_PATH);
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
});
