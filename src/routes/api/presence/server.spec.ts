import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { BETTER_AUTH_SECRET: 'test-secret' } }));
vi.mock('$app/environment', () => ({ dev: true, building: false }));

const { PASS_COOKIE, PASS_TTL_MS, mintPass, verifyPass } = await import('$lib/access/pass');
const { POST } = await import('./+server');

const SECRET = 'test-secret';

function jar() {
	const store = new Map<string, string>();
	return {
		cookies: {
			get: (name: string) => store.get(name),
			set: (name: string, value: string) => void store.set(name, value)
		} as unknown as Cookies,
		token: () => store.get(PASS_COOKIE)
	};
}

async function beat(pass: App.Locals['pass'], cookies: Cookies) {
	const headers: Record<string, string> = {};
	const event = {
		locals: { pass },
		cookies,
		setHeaders: (h: Record<string, string>) => Object.assign(headers, h),
		request: new Request('http://localhost/api/presence', { method: 'POST' })
	};
	try {
		// The handler reads only these fields of the RequestEvent.
		return { response: await POST(event as never), headers };
	} catch (thrown) {
		return { thrown: thrown as { status?: number }, headers };
	}
}

describe('POST /api/presence', () => {
	it('refuses a visitor without a pass with 401: the archive has drifted shut', async () => {
		const { cookies, token } = jar();
		const { thrown } = await beat(undefined, cookies);
		expect(thrown?.status).toBe(401);
		expect(token()).toBeUndefined();
	});

	it('slides the pass — same kind, fresh expiry — and is never cached', async () => {
		const { cookies, token } = jar();
		const { pass } = await mintPass(SECRET, 't', 0);
		const before = Date.now();
		const { response, headers } = await beat(pass, cookies);
		expect(response?.status).toBe(204);
		expect(headers['cache-control']).toBe('no-store');
		const slid = await verifyPass(SECRET, token(), before);
		expect(slid?.kind).toBe('t');
		expect(slid?.expiresAt).toBeGreaterThanOrEqual(before + PASS_TTL_MS);
	});
});
