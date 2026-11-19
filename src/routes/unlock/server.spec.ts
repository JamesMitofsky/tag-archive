import type { Cookies } from '@sveltejs/kit';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
vi.mock('$app/environment', () => ({ dev: true, building: false }));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { remoteKey } = await import('$lib/server/db/schema');
const { TAP_FLASH_COOKIE } = await import('$lib/access/flash');
const { LOCKED_PATH } = await import('$lib/access/gate');
const { mintPass, PASS_COOKIE, verifyPass } = await import('$lib/access/pass');
const { GET } = await import('./+server');

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(remoteKey).values([
		{ unlockKey: 'tobyshorin', expiresAt: '2999-01-01' },
		{ unlockKey: 'lapsed', expiresAt: '2001-01-01' }
	]);
});

function jar(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	return {
		cookies: {
			get: (name: string) => store.get(name),
			set: (name: string, value: string) => void store.set(name, value)
		} as unknown as Cookies,
		store
	};
}

let ip = 0;
async function unlock(search: string, cookies: Cookies, address = `198.51.100.${++ip}`) {
	const headers: Record<string, string> = {};
	const event = {
		url: new URL(`https://archive.test/unlock${search}`),
		cookies,
		getClientAddress: () => address,
		setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
	};
	try {
		await GET(event as never);
		throw new Error('expected a redirect');
	} catch (thrown) {
		return { ...(thrown as { status: number; location: string }), headers };
	}
}

describe('GET /unlock', () => {
	it('opens the site for a live key and goes on to the page it was for', async () => {
		const { cookies, store } = jar();
		const res = await unlock('?key=TobyShorin&to=%2Fevents%3Fq%3Dclouds', cookies);
		expect(res).toMatchObject({ status: 303, location: '/events?q=clouds' });
		expect((await verifyPass('test-secret', store.get(PASS_COOKIE)))?.kind).toBe('r');
		expect(store.get(TAP_FLASH_COOKIE)).toBe('ok');
		expect(res.headers['cache-control']).toBe('no-store');
		expect(res.headers['referrer-policy']).toBe('no-referrer');
	});

	it('locks an expired key and an unknown one alike', async () => {
		for (const key of ['lapsed', 'nobody', '']) {
			const { cookies, store } = jar();
			const res = await unlock(`?key=${key}&to=%2Fevents`, cookies);
			expect(res.location, key).toBe(LOCKED_PATH);
			expect(store.get(PASS_COOKIE), key).toBeUndefined();
			expect(store.get(TAP_FLASH_COOKIE), key).toBe('revoked');
		}
	});

	it('never sends the visitor off the site', async () => {
		const { cookies } = jar();
		const res = await unlock('?key=tobyshorin&to=%2F%2Fevil.test%2F', cookies);
		expect(res.location).toBe('/');
	});

	it('waves a visitor already holding a pass straight on, key or no key', async () => {
		const { token } = await mintPass('test-secret', 't');
		const { cookies } = jar({ [PASS_COOKIE]: token });
		expect((await unlock('?key=nobody&to=%2Fimages', cookies)).location).toBe('/images');
	});

	it('stops guessing from one address after a handful of tries', async () => {
		const address = '203.0.113.7';
		let res;
		for (let i = 0; i < 21; i++) res = await unlock('?key=guess', jar().cookies, address);
		expect(res?.location).toBe(LOCKED_PATH);
		const { cookies, store } = jar();
		await unlock('?key=tobyshorin', cookies, address);
		expect(store.get(TAP_FLASH_COOKIE)).toBe('busy');
		expect(store.get(PASS_COOKIE)).toBeUndefined();
	});
});
