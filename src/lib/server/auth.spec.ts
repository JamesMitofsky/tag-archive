/**
 * The sign-in and account-creation flows, run against the real better-auth
 * config and a migrated SQLite database. These are the calls the keeper pages
 * make (src/routes/keeper/+page.server.ts and settings/create-user), so a
 * better-auth upgrade that changes their behavior fails here first: OTP sign-in,
 * an admin creating a keeper with the app's own `contributor` role, and the
 * account-created magic link.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
	process.env.ORIGIN = 'http://localhost:5173';
	process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth-0123456789';
});

// SvelteKit only populates $env/dynamic/private inside a running server.
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

// The emails' contents are someone else's test; capture what would be sent.
const sent = vi.hoisted(() => ({
	otps: new Map<string, string>(),
	links: new Map<string, string>()
}));
vi.mock('$lib/server/email', () => ({
	sendOtpEmail: async (email: string, otp: string) => void sent.otps.set(email, otp),
	sendAccountCreatedEmail: async (email: string, url: string) => void sent.links.set(email, url)
}));

// sveltekitCookies writes the session cookie onto the current request event.
// Outside a server there is none, so stand in one that keeps a cookie jar.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('$app/server', () => ({
	getRequestEvent: () => ({
		cookies: { set: (name: string, value: string) => void jar.set(name, value) }
	})
}));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { user } = await import('$lib/server/db/auth.schema');
const { auth } = await import('$lib/server/auth');

beforeAll(migrateTestDatabase);

const ORIGIN = 'http://localhost:5173';

/** Request headers carrying whatever session cookie the last sign-in set. */
function signedInHeaders(): Headers {
	const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
	return new Headers({ cookie, origin: ORIGIN });
}

async function signInWithOtp(email: string) {
	jar.clear();
	await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
	const otp = sent.otps.get(email);
	expect(otp).toMatch(/^\d{6}$/);
	await auth.api.signInEmailOTP({
		body: { email, otp: otp! },
		headers: new Headers({ origin: ORIGIN })
	});
	return auth.api.getSession({ headers: signedInHeaders() });
}

describe('auth flows', () => {
	it('signs a keeper in with an emailed one-time code', async () => {
		const session = await signInWithOtp('keeper@example.com');
		expect(session?.user.email).toBe('keeper@example.com');
		expect(session?.user.role).toBe('contributor');
	});

	it('rejects a wrong one-time code', async () => {
		await auth.api.sendVerificationOTP({ body: { email: 'wrong@example.com', type: 'sign-in' } });
		await expect(
			auth.api.signInEmailOTP({
				body: { email: 'wrong@example.com', otp: '000000' },
				headers: new Headers({ origin: ORIGIN })
			})
		).rejects.toThrow();
	});

	it('lets an admin create a contributor and emails them a sign-in link', async () => {
		await signInWithOtp('admin@example.com');
		await db.update(user).set({ role: 'admin' }).where(eq(user.email, 'admin@example.com'));
		// Sign in again so the cookie cache carries the new role.
		await signInWithOtp('admin@example.com');
		const headers = signedInHeaders();

		const created = await auth.api.createUser({
			body: { name: 'New Keeper', email: 'new@example.com', role: 'contributor' as 'admin' },
			headers
		});
		expect(created.user.role).toBe('contributor');

		await auth.api.signInMagicLink({
			body: { email: 'new@example.com', callbackURL: '/keeper', errorCallbackURL: '/keeper' },
			headers
		});
		expect(sent.links.get('new@example.com')).toContain('/magic-link/verify?token=');
	});

	it('refuses account creation to a contributor', async () => {
		await signInWithOtp('plain@example.com');
		await expect(
			auth.api.createUser({
				body: { name: 'Nope', email: 'nope@example.com', role: 'contributor' as 'admin' },
				headers: signedInHeaders()
			})
		).rejects.toThrow();
	});
});
