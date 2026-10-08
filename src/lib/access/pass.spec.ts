import { describe, expect, it, vi } from 'vitest';
import { mintPass, PASS_TTL_MS, verifyPass } from './pass';

vi.mock('$env/dynamic/private', () => ({ env: { BETTER_AUTH_SECRET: 'test-secret' } }));

const SECRET = 'test-secret';

describe('access pass', () => {
	it('round-trips a minted pass until it expires', async () => {
		const { token, pass } = await mintPass(SECRET, 't', 1_000);
		expect(pass).toEqual({ kind: 't', issuedAt: 1_000, expiresAt: 1_000 + PASS_TTL_MS });
		expect(await verifyPass(SECRET, token, 1_000 + PASS_TTL_MS - 1)).toEqual(pass);
		expect(await verifyPass(SECRET, token, 1_000 + PASS_TTL_MS)).toBeNull();
	});

	it('rejects a pass signed with another secret', async () => {
		const { token } = await mintPass('other-secret', 'k', 0);
		expect(await verifyPass(SECRET, token, 1)).toBeNull();
	});

	it('rejects a pass whose fields were altered', async () => {
		const { token } = await mintPass(SECRET, 't', 0);
		const [v, kind, issued, expires, sig] = token.split('.');
		// Stretching the expiry would keep the site open for free.
		expect(
			await verifyPass(SECRET, [v, kind, issued, Number(expires) * 2, sig].join('.'), 1)
		).toBeNull();
		expect(await verifyPass(SECRET, [v, 'k', issued, expires, sig].join('.'), 1)).toBeNull();
		expect(await verifyPass(SECRET, [v, kind, issued, expires].join('.'), 1)).toBeNull();
		expect(await verifyPass(SECRET, [v, kind, issued, expires, `${sig}x`].join('.'), 1)).toBeNull();
	});

	it.each([undefined, null, '', 'garbage', 'v2.t.0.9.sig', 'v1.x.0.9.c2ln', 'v1.t.a.9.c2ln'])(
		'rejects malformed token %s',
		async (token) => {
			expect(await verifyPass(SECRET, token, 1)).toBeNull();
		}
	);

	it('opens nothing without a secret', async () => {
		const { token } = await mintPass(SECRET, 't', 0);
		expect(await verifyPass('', token, 1)).toBeNull();
	});

	it('signs exactly as $lib/server/signing does for purpose "access"', async () => {
		// The edge gate (Web Crypto) and the server (node:crypto) must agree on
		// every signature; this pins the shared key derivation.
		const { sign } = await import('$lib/server/signing');
		const { token } = await mintPass(SECRET, 'k', 42, 1000);
		const payload = token.slice(0, token.lastIndexOf('.'));
		expect(token.slice(token.lastIndexOf('.') + 1)).toBe(sign('access', payload));
	});
});
