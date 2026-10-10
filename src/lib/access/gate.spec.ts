import { describe, expect, it } from 'vitest';
import { config } from '../../../netlify/edge-functions/access-gate';
import { gateRequest } from './edge';
import { accessDecision, isOpenPath, LOCKED_PATH } from './gate';
import { KEEPER_DOOR_PARAM, KEEPER_DOOR_URL } from './keeperDoor.server';
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
