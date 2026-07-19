import { fail } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import { auth } from '$lib/server/auth';
import {
	createEmailSuite,
	createOtpSuite,
	parseEmailForm,
	parseOtpForm
} from '$lib/validation/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// The keeper page is the sign-in gateway + hub; the archive lists live on the
	// artefacts/events/series sub-routes.
	return {
		user: locals.user ? { email: locals.user.email, role: locals.user.role } : null
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

		try {
			await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
		} catch (e) {
			console.error('[cloud-keeper] failed to send OTP', e);
			return fail(500, {
				step: 'email' as const,
				email,
				error: 'Could not send the code. Try again in a moment.'
			});
		}

		return { step: 'otp' as const, email };
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
			if (!(e instanceof APIError)) console.error('[cloud-keeper] OTP sign-in failed', e);
			return fail(400, { step: 'otp' as const, email, error: message });
		}

		return { step: 'signed-in' as const };
	}
};
