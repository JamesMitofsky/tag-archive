import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { APIError } from 'better-auth';
import { auth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
const otpSchema = z
	.string()
	.trim()
	.regex(/^\d{6}$/, 'Code is 6 digits');

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
		const parsed = emailSchema.safeParse(form.get('email'));
		if (!parsed.success) {
			return fail(400, { step: 'email' as const, error: 'Enter a valid email address' });
		}

		try {
			await auth.api.sendVerificationOTP({ body: { email: parsed.data, type: 'sign-in' } });
		} catch (e) {
			console.error('[keeper] failed to send OTP', e);
			return fail(500, {
				step: 'email' as const,
				email: parsed.data,
				error: 'Could not send the code. Try again in a moment.'
			});
		}

		return { step: 'otp' as const, email: parsed.data };
	},

	verifyOtp: async ({ request }) => {
		const form = await request.formData();
		const email = emailSchema.safeParse(form.get('email'));
		const otp = otpSchema.safeParse(form.get('otp'));
		if (!email.success) {
			return fail(400, { step: 'email' as const, error: 'Enter a valid email address' });
		}
		if (!otp.success) {
			return fail(400, {
				step: 'otp' as const,
				email: email.data,
				error: otp.error.issues[0].message
			});
		}

		try {
			// sveltekitCookies (last auth plugin) sets the session cookie on this event.
			await auth.api.signInEmailOTP({
				body: { email: email.data, otp: otp.data },
				headers: request.headers
			});
		} catch (e) {
			const message =
				e instanceof APIError
					? 'That code is wrong or expired. Request a new one.'
					: 'Sign-in failed. Try again.';
			if (!(e instanceof APIError)) console.error('[keeper] OTP sign-in failed', e);
			return fail(400, { step: 'otp' as const, email: email.data, error: message });
		}

		return { step: 'signed-in' as const };
	}
};
