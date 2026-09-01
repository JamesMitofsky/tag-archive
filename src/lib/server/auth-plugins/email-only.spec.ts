import { describe, expect, it } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { APIError } from 'better-auth/api';
import { emailOnlySignIn } from './email-only';

// In-memory better-auth instance with only the plugin under test, so the spec
// exercises the real endpoint pipeline (body parsing, session hooks, cookies)
// without a database or the app's env-driven config.
function createAuth() {
	const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] };
	return betterAuth({
		baseURL: 'http://localhost:3000',
		secret: 'test-secret-test-secret-test-secret',
		database: memoryAdapter(db),
		plugins: [emailOnlySignIn()]
	});
}

describe('emailOnlySignIn', () => {
	it('issues a session and cookie for an existing account, case-insensitively', async () => {
		const auth = createAuth();
		const ctx = await auth.$context;
		const user = await ctx.internalAdapter.createUser({
			name: 'Keeper',
			email: 'keeper@test.com',
			emailVerified: true
		});

		const res = await auth.api.signInEmailOnly({
			body: { email: '  Keeper@Test.com ' },
			asResponse: true
		});

		expect(res.status).toBe(200);
		expect(res.headers.get('set-cookie')).toMatch(/better-auth\.session_token=/);
		const body = (await res.json()) as { token: string; user: { id: string } };
		expect(body.user.id).toBe(user.id);
		const session = await ctx.internalAdapter.findSession(body.token);
		expect(session?.user.id).toBe(user.id);
	});

	it('rejects unknown emails without creating an account', async () => {
		const auth = createAuth();
		const ctx = await auth.$context;

		await expect(
			auth.api.signInEmailOnly({ body: { email: 'nobody@test.com' } })
		).rejects.toBeInstanceOf(APIError);
		await expect(
			auth.api.signInEmailOnly({ body: { email: 'nobody@test.com' } })
		).rejects.toMatchObject({ status: 'UNAUTHORIZED' });
		expect(await ctx.internalAdapter.findUserByEmail('nobody@test.com')).toBeNull();
	});
});
