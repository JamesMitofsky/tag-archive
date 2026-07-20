import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, emailOTP, magicLink } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	session: {
		// Read the session from a short-lived signed cookie instead of hitting the
		// DB on every request. Without this, once a session ages past `updateAge`
		// better-auth issues a session-refresh WRITE on each request; if that write
		// transiently fails on the shared libsql HTTP client it deletes the cookie
		// and signs the user out ("disconnected right after doing something"). The
		// cache serves most requests with no DB write, so the refresh path — and its
		// logout-on-failure branch — is hit far less often.
		cookieCache: { enabled: true, maxAge: 300 }
	},
	plugins: [
		emailOTP({
			otpLength: 6,
			expiresIn: 300,
			storeOTP: 'hashed',
			sendVerificationOTP: async ({ email, otp }) => {
				// Sign-in is the only OTP flow (passwordless app), so `type` is ignored.
				// Imported lazily so `better-auth generate` can load this config
				// without the Node ESM loader traversing OtpEmail.svelte (which it
				// can't parse — ERR_UNKNOWN_FILE_EXTENSION on ".svelte").
				const { sendOtpEmail } = await import('$lib/server/email');
				return sendOtpEmail(email, otp);
			}
		}),
		magicLink({
			// One-click sign-in embedded in the account-created email. Long-lived
			// (7 days) so a newly-invited user can act on the email at their leisure;
			// once it lapses the verify endpoint just bounces them to /keeper, where
			// they request a fresh OTP. Hashed at rest to match the OTP flow.
			expiresIn: 60 * 60 * 24 * 7,
			storeToken: 'hashed',
			// The link only ever targets pre-created accounts, so never silently
			// spin up a new user off a stale/forged token.
			disableSignUp: true,
			sendMagicLink: async ({ email, url }) => {
				// Account creation is the only caller of signInMagicLink, so this
				// callback *is* the account-created notification. Lazy import keeps
				// `.svelte` out of the module graph the better-auth CLI traverses.
				const { sendAccountCreatedEmail } = await import('$lib/server/email');
				return sendAccountCreatedEmail(email, url);
			}
		}),
		admin({ defaultRole: 'contributor', adminRoles: ['admin'] }),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
