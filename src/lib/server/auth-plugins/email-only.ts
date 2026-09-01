import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import * as z from 'zod';

export const EMAIL_ONLY_ERROR_CODES = {
	USER_NOT_FOUND: 'No account exists for that email'
} as const;

/**
 * Sign-in by email alone: whoever submits the address of an existing account
 * is issued a session for it, with no code, link, or password checked.
 *
 * This is deliberately unverified — the archive treats knowing a keeper's
 * email as sufficient. It never creates accounts (those come from the admin
 * create-user tool), and the admin plugin's session-create hook still refuses
 * banned users. Mutually exclusive with the emailOTP plugin: see auth.ts.
 *
 * Shaped like better-auth's own magic-link verify step (find user → create
 * session → set cookie) so `auth.api.signInEmailOnly` behaves like any other
 * sign-in endpoint, including sveltekitCookies writing the session cookie.
 */
export const emailOnlySignIn = () => {
	return {
		id: 'email-only-sign-in',
		endpoints: {
			signInEmailOnly: createAuthEndpoint(
				'/sign-in/email-only',
				{
					method: 'POST',
					body: z.object({
						email: z.string().meta({ description: 'Email of an existing account' })
					}),
					metadata: {
						openapi: {
							operationId: 'signInEmailOnly',
							description: 'Sign in with an email address only (no verification)',
							responses: {
								200: {
									description: 'Success',
									content: {
										'application/json': {
											schema: {
												type: 'object',
												properties: {
													token: { type: 'string' },
													user: { $ref: '#/components/schemas/User' }
												}
											}
										}
									}
								}
							}
						}
					}
				},
				async (ctx) => {
					const email = ctx.body.email.trim().toLowerCase();
					const found = await ctx.context.internalAdapter.findUserByEmail(email);
					if (!found) {
						throw new APIError('UNAUTHORIZED', {
							message: EMAIL_ONLY_ERROR_CODES.USER_NOT_FOUND
						});
					}

					const { user } = found;
					const session = await ctx.context.internalAdapter.createSession(user.id);
					await setSessionCookie(ctx, { session, user });

					return ctx.json({ token: session.token, user });
				}
			)
		},
		$ERROR_CODES: EMAIL_ONLY_ERROR_CODES,
		rateLimit: [
			{
				pathMatcher(path) {
					return path === '/sign-in/email-only';
				},
				window: 60,
				max: 5
			}
		]
	} satisfies BetterAuthPlugin;
};
