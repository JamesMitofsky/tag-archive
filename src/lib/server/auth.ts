import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, emailOTP } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { sendOtpEmail } from '$lib/server/email';

/** First sign-in with this email is auto-granted the admin role. */
const adminEmail = () => (env.ADMIN_EMAIL ?? 'jamesmitofsky@gmail.com').toLowerCase();

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					if (user.email.toLowerCase() === adminEmail()) {
						return { data: { ...user, role: 'admin' } };
					}
				}
			}
		}
	},
	plugins: [
		emailOTP({
			otpLength: 6,
			expiresIn: 300,
			storeOTP: 'hashed',
			sendVerificationOTP: ({ email, otp, type }) => sendOtpEmail(email, otp, type)
		}),
		admin({ defaultRole: 'contributor', adminRoles: ['admin'] }),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
