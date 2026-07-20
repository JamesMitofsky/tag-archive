import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, emailOTP } from 'better-auth/plugins';
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
		admin({ defaultRole: 'contributor', adminRoles: ['admin'] }),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
