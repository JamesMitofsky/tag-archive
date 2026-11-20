/**
 * The sign-in and account-creation flows, run against the real better-auth
 * config and a migrated SQLite database. These are the calls the keeper pages
 * make (src/routes/keeper/+page.server.ts and settings/create-user), so a
 * better-auth upgrade that changes their behavior fails here first: OTP sign-in,
 * an admin creating a keeper with the app's own `contributor` role, and the
 * account-created magic link. Also the 30-second wait between sign-in codes
 * (#lib/server/otpResendCooldown), which rides on better-auth's hook pipeline.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
	useTestDatabaseUrl();
	process.env.ORIGIN = 'http://localhost:5173';
	process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth-0123456789';
});

// SvelteKit fills $app/env/private when the Vite config loads, before this file sets
// the variables, so the spec hands the module the live process.env instead.
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());

// The emails' contents are someone else's test; capture what would be sent.
const sent = vi.hoisted(() => ({
	otps: new Map<string, string>(),
	links: new Map<string, string>()
}));
vi.mock('#lib/server/email.ts', () => ({
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

const { migrateTestDatabase } = await import('#lib/server/db/testing.ts');
const { db } = await import('#lib/server/db/index.ts');
const { user } = await import('#lib/server/db/auth.schema.ts');
const { auth } = await import('#lib/server/auth.ts');
const { cooldownRetryAfter } = await import('#lib/server/otpResendCooldown.ts');

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

describe('the wait between sign-in codes', () => {
	const send = (email: string) =>
		auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
	const signIn = (email: string, otp: string) =>
		auth.api.signInEmailOTP({ body: { email, otp }, headers: new Headers({ origin: ORIGIN }) });
	/** The cooldown's seconds left if `promise` was refused by it, else null. */
	const refusal = (promise: Promise<unknown>) => promise.then(() => null, cooldownRetryAfter);

	// Only the clock is faked, so the database driver's own timers run as normal.
	beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: Date.now() }));
	afterEach(() => vi.useRealTimers());
	const wait = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);

	it('turns away a second code for 30 seconds, without sending it', async () => {
		await send('again@example.com');
		const first = sent.otps.get('again@example.com');

		wait(10);
		expect(await refusal(send('again@example.com'))).toBe(20);
		expect(sent.otps.get('again@example.com')).toBe(first);

		wait(21);
		await send('again@example.com');
		const second = sent.otps.get('again@example.com');
		expect(second).toMatch(/^\d{6}$/);
		expect(second).not.toBe(first);
		// The new code replaces the old one.
		if (first !== second) await expect(signIn('again@example.com', first!)).rejects.toThrow();
		expect((await signIn('again@example.com', second!)).user.email).toBe('again@example.com');
	});

	it('keeps each email to its own wait', async () => {
		await send('one@example.com');
		await expect(send('two@example.com')).resolves.toBeTruthy();
		expect(await refusal(send('ONE@example.com'))).toBe(30);
	});

	it('is not restarted by a wrong guess', async () => {
		await send('typo@example.com');
		wait(25);
		await expect(signIn('typo@example.com', '000000')).rejects.toThrow();
		wait(6);
		expect(await refusal(send('typo@example.com'))).toBeNull();
	});

	it('ends with a successful sign-in', async () => {
		await send('quick@example.com');
		await signIn('quick@example.com', sent.otps.get('quick@example.com')!);
		expect(await refusal(send('quick@example.com'))).toBeNull();
	});

	it('holds over the public endpoint too, not only the server call', async () => {
		await send('http@example.com');
		const res = await auth.handler(
			new Request(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: ORIGIN },
				body: JSON.stringify({ email: 'http@example.com', type: 'sign-in' })
			})
		);
		expect(res.status).toBe(429);
		expect(res.headers.get('retry-after')).toBe('30');
	});
});
