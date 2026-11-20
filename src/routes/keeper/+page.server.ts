import { fail } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import { auth } from '#lib/server/auth.ts';
import { cooldownRetryAfter } from '#lib/server/otpResendCooldown.ts';
import {
	OTP_RESEND_COOLDOWN_S,
	createEmailSuite,
	createOtpSuite,
	parseEmailForm,
	parseOtpForm
} from '#lib/validation/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// The keeper page is the sign-in gateway + hub; the archive lists live on the
	// artefacts/events/series sub-routes.
	// A listener (see #lib/roles) is signed in but no keeper: the hub shows them
	// where the archive is instead of the keeper tools.
	return {
		user: locals.user ? { email: locals.user.email, role: locals.user.role } : null,
		listener: locals.listener ? { email: locals.listener.email } : null
	};
};

export const actions: Actions = {
	sendOtp: async ({ request }) => {
		const form = await request.formData();
		const { email } = parseEmailForm(form);
		if (!createEmailSuite()({ email }).isValid()) {
			return fail(400, {
				step: 'email' as const,
				error: 'Enter a valid email address',
				errors: { email: ['Enter a valid email address'] }
			});
		}

		// The page counts `resendIn` down on its resend button; the server holds
		// the same line (#lib/server/otpResendCooldown). A send turned away by
		// the cooldown still lands on the code step, because the code sent a
		// moment ago is still good.
		try {
			await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
		} catch (e) {
			const retryAfter = cooldownRetryAfter(e);
			if (retryAfter !== null) {
				return fail(429, {
					step: 'otp' as const,
					email,
					resendIn: retryAfter,
					error: `A code was sent a moment ago. You can ask for another in ${retryAfter} seconds.`
				});
			}
			console.error('[keeper] failed to send OTP', e);
			return fail(500, {
				step: 'email' as const,
				email,
				error: 'Could not send the code. Try again in a moment.'
			});
		}

		return { step: 'otp' as const, email, resendIn: OTP_RESEND_COOLDOWN_S };
	},

	verifyOtp: async ({ request }) => {
		const form = await request.formData();
		const { email } = parseEmailForm(form);
		const { otp } = parseOtpForm(form);
		if (!createEmailSuite()({ email }).isValid()) {
			return fail(400, { step: 'email' as const, error: 'Enter a valid email address' });
		}
		const otpResult = createOtpSuite()({ otp });
		if (!otpResult.isValid()) {
			return fail(400, {
				step: 'otp' as const,
				email,
				error: otpResult.getErrors('otp')[0]
			});
		}

		try {
			// sveltekitCookies (last auth plugin) sets the session cookie on this event.
			await auth.api.signInEmailOTP({
				body: { email, otp },
				headers: request.headers
			});
		} catch (e) {
			const message =
				e instanceof APIError
					? 'That code is wrong or expired. Request a new one.'
					: 'Sign-in failed. Try again.';
			if (!(e instanceof APIError)) console.error('[keeper] OTP sign-in failed', e);
			return fail(400, { step: 'otp' as const, email, error: message });
		}

		return { step: 'signed-in' as const };
	}
};
