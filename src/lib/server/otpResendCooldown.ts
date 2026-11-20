import { APIError } from 'better-auth';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import type { BetterAuthPlugin } from 'better-auth';
import { OTP_RESEND_COOLDOWN_S } from '#lib/validation/auth.ts';

/**
 * A better-auth plugin that makes a sent one-time code hold the door shut on
 * another for OTP_RESEND_COOLDOWN_S, per email and code type.
 *
 * It lives in better-auth's hook pipeline rather than in the keeper page's
 * action because better-auth runs these hooks for `auth.api.*` calls (the
 * action) and for its public HTTP endpoint under /api/auth alike, so neither
 * way round skips the wait. better-auth's own rate limiter covers only HTTP,
 * and only per IP.
 *
 * The wait is kept as its own row in better-auth's `verification` table, a
 * marker that expires when the cooldown ends (better-auth sweeps expired rows).
 * The code's own row can't stand in for it: a wrong guess rewrites that row
 * with a fresh `createdAt`, which would restart the wait on every typo.
 *
 * The marker is written after better-auth accepts a send, and cleared by a
 * successful sign-in, so a keeper who signs out and straight back in isn't kept
 * waiting. "Accepts" is all it can know: better-auth logs a failed email and
 * still answers the send with success, so a bounced code holds the wait too.
 */

const SEND_PATH = '/email-otp/send-verification-otp';
const SIGN_IN_PATH = '/sign-in/email-otp';

/** Code the cooldown refusal carries, so callers can tell it from other 429s. */
export const OTP_RESEND_COOLDOWN_CODE = 'OTP_RESEND_COOLDOWN';

type SendBody = { email?: unknown; type?: unknown };

/** The marker's identifier, or null for a body better-auth will reject anyway. */
function markerIdentifier(body: unknown): string | null {
	const { email, type } = (body ?? {}) as SendBody;
	if (typeof email !== 'string' || typeof type !== 'string') return null;
	// better-auth lowercases the email the same way before it stores the code.
	return `${type}-otp-resend-${email.toLowerCase()}`;
}

/** Whole seconds until `expiresAt`, at least 1 while it is still ahead. */
export function secondsUntil(expiresAt: Date, now = Date.now()): number {
	return Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000));
}

export const otpResendCooldown = () =>
	({
		id: 'otp-resend-cooldown',
		hooks: {
			before: [
				{
					matcher: (ctx) => ctx.path === SEND_PATH,
					handler: createAuthMiddleware(async (ctx) => {
						const identifier = markerIdentifier(ctx.body);
						if (!identifier) return;
						const marker = await ctx.context.internalAdapter.findVerificationValue(identifier);
						if (!marker || marker.expiresAt.getTime() <= Date.now()) return;
						const retryAfter = secondsUntil(marker.expiresAt);
						throw new APIError(
							'TOO_MANY_REQUESTS',
							{
								code: OTP_RESEND_COOLDOWN_CODE,
								message: `A code was sent a moment ago. You can ask for another in ${retryAfter} seconds.`,
								retryAfter
							},
							{ 'Retry-After': String(retryAfter) }
						);
					})
				}
			],
			after: [
				{
					matcher: (ctx) => ctx.path === SEND_PATH,
					handler: createAuthMiddleware(async (ctx) => {
						if (isAPIError(ctx.context.returned)) return;
						const identifier = markerIdentifier(ctx.body);
						if (!identifier) return;
						const { internalAdapter } = ctx.context;
						await internalAdapter.deleteVerificationByIdentifier(identifier);
						await internalAdapter.createVerificationValue({
							identifier,
							value: 'sent',
							expiresAt: new Date(Date.now() + OTP_RESEND_COOLDOWN_S * 1000)
						});
					})
				},
				{
					matcher: (ctx) => ctx.path === SIGN_IN_PATH,
					handler: createAuthMiddleware(async (ctx) => {
						if (isAPIError(ctx.context.returned)) return;
						const identifier = markerIdentifier({ ...ctx.body, type: 'sign-in' });
						if (identifier)
							await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
					})
				}
			]
		}
	}) satisfies BetterAuthPlugin;

/** The seconds left on a cooldown refusal from `auth.api.sendVerificationOTP`, else null. */
export function cooldownRetryAfter(e: unknown): number | null {
	if (!isAPIError(e) || e.statusCode !== 429) return null;
	const body = e.body as { code?: unknown; retryAfter?: unknown } | undefined;
	if (body?.code !== OTP_RESEND_COOLDOWN_CODE) return null;
	return typeof body.retryAfter === 'number' ? body.retryAfter : OTP_RESEND_COOLDOWN_S;
}
