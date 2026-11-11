import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { BETTER_AUTH_SECRET: 'test-secret' } }));
vi.mock('$app/environment', () => ({ dev: false, building: false }));

const { PASS_COOKIE, PASS_TTL_MS, mintPass, verifyPass } = await import('$lib/access/pass');
const { issuePass, keeperPass, mayIssuePass, readPass, touchPass } = await import('./access');

const SECRET = 'test-secret';

/** A cookie jar that also remembers the options each cookie was set with. */
function jar(initial?: string) {
	const store = new Map<string, string>();
	const options = new Map<string, Record<string, unknown>>();
	if (initial) store.set(PASS_COOKIE, initial);
	const cookies = {
		get: (name: string) => store.get(name),
		set: (name: string, value: string, opts: Record<string, unknown>) => {
			store.set(name, value);
			options.set(name, opts);
		}
	} as unknown as Cookies;
	return { cookies, options, token: () => store.get(PASS_COOKIE) };
}

/** A bare fetch of an endpoint: the one request shape the CDN may cache. */
const bareFetch = { method: 'GET', accept: '*/*', isDataRequest: false, isEnhancedAction: false };
const pageView = { ...bareFetch, accept: 'text/html,*/*' };

describe('issuePass / touchPass', () => {
	it('issues a pass good for PASS_TTL_MS, in a cookie that lives exactly as long', async () => {
		const { cookies, options, token } = jar();
		const pass = await issuePass(cookies, 't', 1_000);
		expect(pass).toEqual({ kind: 't', issuedAt: 1_000, expiresAt: 1_000 + PASS_TTL_MS });
		expect(await verifyPass(SECRET, token(), 1_000)).toEqual(pass);
		expect(options.get(PASS_COOKIE)).toMatchObject({
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
			maxAge: PASS_TTL_MS / 1000
		});
	});

	it('slides a pass: same kind, another PASS_TTL_MS from now', async () => {
		const { cookies, token } = jar((await mintPass(SECRET, 'k', 0)).token);
		const current = await readPass(cookies, 1);
		const slid = await touchPass(cookies, current!, PASS_TTL_MS - 1);
		expect(slid).toEqual({ kind: 'k', issuedAt: PASS_TTL_MS - 1, expiresAt: 2 * PASS_TTL_MS - 1 });
		expect(await verifyPass(SECRET, token(), 2 * PASS_TTL_MS - 2)).toEqual(slid);
	});
});

describe('mayIssuePass', () => {
	it('allows any response the CDN can never cache', () => {
		expect(mayIssuePass({ ...bareFetch, method: 'POST' })).toBe(true);
		expect(mayIssuePass({ ...bareFetch, method: 'DELETE' })).toBe(true);
		expect(mayIssuePass(pageView)).toBe(true);
		expect(mayIssuePass({ ...pageView, method: 'HEAD' })).toBe(true);
		expect(mayIssuePass({ ...bareFetch, isDataRequest: true })).toBe(true);
		expect(mayIssuePass({ ...bareFetch, isEnhancedAction: true })).toBe(true);
	});

	it('refuses a bare GET of an endpoint, which the edge may cache for everyone', () => {
		expect(mayIssuePass(bareFetch)).toBe(false);
		expect(mayIssuePass({ ...bareFetch, accept: null })).toBe(false);
		expect(mayIssuePass({ ...bareFetch, method: 'HEAD' })).toBe(false);
	});
});

describe('keeperPass', () => {
	it('leaves a valid pass alone: sliding is the presence beat’s job', async () => {
		const { cookies, token } = jar((await mintPass(SECRET, 't', 0)).token);
		const before = token();
		const current = await readPass(cookies, 1);
		expect(await keeperPass(cookies, current, pageView, 1)).toEqual(current);
		expect(token()).toBe(before);
	});

	it('hands a keeper without a pass a fresh one, on a page view', async () => {
		const { cookies, token } = jar();
		const pass = await keeperPass(cookies, null, pageView, 5_000);
		expect(pass).toEqual({ kind: 'k', issuedAt: 5_000, expiresAt: 5_000 + PASS_TTL_MS });
		expect(await verifyPass(SECRET, token(), 5_000)).toEqual(pass);
	});

	it('hands one out on a POST too — the presence beat is how a lapsed keeper recovers', async () => {
		const { cookies } = jar();
		expect(await keeperPass(cookies, null, { ...bareFetch, method: 'POST' })).toMatchObject({
			kind: 'k'
		});
	});

	it('never sets a cookie on a bare fetch, which the CDN might cache', async () => {
		const { cookies, token } = jar();
		expect(await keeperPass(cookies, null, bareFetch)).toBeNull();
		expect(token()).toBeUndefined();
	});
});
