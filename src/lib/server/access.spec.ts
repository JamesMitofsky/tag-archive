import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', async () =>
	(await import('#lib/testing/env.ts')).privateEnv({ BETTER_AUTH_SECRET: 'test-secret' })
);
vi.mock('$app/env', () => ({ dev: false, building: false }));

const { PASS_COOKIE, PASS_TTL_MS, mintPass, verifyPass } = await import('#lib/access/pass.ts');
const { verifyFileGrant } = await import('#lib/access/fileGrant.ts');
const { FILE_GRANT_TTL_MS, grantFiles, issuePass, mayIssuePass, readPass, sessionPass, touchPass } =
	await import('./access');

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

describe('sessionPass', () => {
	it('leaves a valid pass alone: sliding is the presence beat’s job', async () => {
		const { cookies, token } = jar((await mintPass(SECRET, 't', 0)).token);
		const before = token();
		const current = await readPass(cookies, 1);
		expect(await sessionPass(cookies, current, pageView, 'k', 1)).toEqual(current);
		expect(token()).toBe(before);
	});

	it('hands a keeper without a pass a fresh one, on a page view', async () => {
		const { cookies, token } = jar();
		const pass = await sessionPass(cookies, null, pageView, 'k', 5_000);
		expect(pass).toEqual({ kind: 'k', issuedAt: 5_000, expiresAt: 5_000 + PASS_TTL_MS });
		expect(await verifyPass(SECRET, token(), 5_000)).toEqual(pass);
	});

	it('hands one out on a POST too — the presence beat is how a lapsed keeper recovers', async () => {
		const { cookies } = jar();
		expect(await sessionPass(cookies, null, { ...bareFetch, method: 'POST' }, 'k')).toMatchObject({
			kind: 'k'
		});
	});

	it('hands a listener a pass of their own kind, which opens only their page', async () => {
		const { cookies, token } = jar();
		const pass = await sessionPass(cookies, null, pageView, 'l', 5_000);
		expect(pass).toEqual({ kind: 'l', issuedAt: 5_000, expiresAt: 5_000 + PASS_TTL_MS });
		expect(await verifyPass(SECRET, token(), 5_000)).toEqual(pass);
	});

	it('never sets a cookie on a bare fetch, which the CDN might cache', async () => {
		const { cookies, token } = jar();
		expect(await sessionPass(cookies, null, bareFetch, 'k')).toBeNull();
		expect(token()).toBeUndefined();
	});

	it('keeps a pass a listener earned in the garden, by the door or with a key', async () => {
		for (const kind of ['t', 'd', 'r'] as const) {
			const { cookies, token } = jar((await mintPass(SECRET, kind, 0)).token);
			const before = token();
			const current = await readPass(cookies, 1);
			expect(await sessionPass(cookies, current, pageView, 'l', 1)).toEqual(current);
			expect(token()).toBe(before);
		}
	});

	it('swaps the other kind of account’s pass, so a role change is not outlasted by the beat', async () => {
		// An admin made a listener keeps no whole-site pass ...
		const demoted = jar((await mintPass(SECRET, 'k', 0)).token);
		const fromKeeper = await readPass(demoted.cookies, 1);
		expect(await sessionPass(demoted.cookies, fromKeeper, pageView, 'l', 2)).toEqual({
			kind: 'l',
			issuedAt: 2,
			expiresAt: 2 + PASS_TTL_MS
		});
		expect((await verifyPass(SECRET, demoted.token(), 2))?.kind).toBe('l');

		// ... and a listener made a keeper is no longer held to one page.
		const promoted = jar((await mintPass(SECRET, 'l', 0)).token);
		const fromListener = await readPass(promoted.cookies, 1);
		expect(await sessionPass(promoted.cookies, fromListener, pageView, 'k', 2)).toMatchObject({
			kind: 'k'
		});
	});

	it('counts the other kind’s pass for nothing where the swap can’t be set', async () => {
		const { cookies, token } = jar((await mintPass(SECRET, 'k', 0)).token);
		const before = token();
		const current = await readPass(cookies, 1);
		expect(await sessionPass(cookies, current, bareFetch, 'l', 1)).toBeNull();
		expect(token()).toBe(before);
	});
});

describe('grantFiles', () => {
	const HOUR = 60 * 60 * 1000;

	it('signs scans shipped with the deployment and leaves bucket URLs as they were', async () => {
		const bucket = 'https://pub.r2.test/scans/0b9c.webp';
		const [local, remote] = await grantFiles(['/artefacts/A program.webp', bucket], 0);
		expect(remote).toBe(bucket);
		const url = new URL(local, 'https://archive.test');
		expect(url.pathname).toBe('/artefacts/A%20program.webp');
		const request = { pathname: url.pathname, search: url.search, method: 'GET' };
		expect(await verifyFileGrant(SECRET, request, FILE_GRANT_TTL_MS - 1)).toBe(true);
	});

	it('signs the same URL all hour, good for at least FILE_GRANT_TTL_MS', async () => {
		const start = 5 * HOUR + 1;
		const [first] = await grantFiles(['/artefacts/a.webp'], start);
		const [later] = await grantFiles(['/artefacts/a.webp'], 6 * HOUR - 1);
		expect(later).toBe(first);
		const expiresAt = Number(new URL(first, 'https://x').searchParams.get('grant')!.split('.')[0]);
		expect(expiresAt % HOUR).toBe(0);
		expect(expiresAt - (6 * HOUR - 1)).toBeGreaterThanOrEqual(FILE_GRANT_TTL_MS);
	});
});
