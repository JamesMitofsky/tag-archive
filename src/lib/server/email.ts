import { env } from '$env/dynamic/private';

type OtpType = 'sign-in' | 'email-verification' | 'forget-password';

/** Dev without pulling in `$app/environment`, which the better-auth CLI (jiti, no Vite) can't resolve. */
const isDev = env.NODE_ENV !== 'production';

/**
 * Delivers a one-time password via Resend.
 *
 * In local dev (or when no RESEND_API_KEY is set) the code is logged to the
 * server console instead of sent, so the OTP flow stays testable against the
 * seeded test accounts — Resend's free tier would reject those recipients
 * anyway (it only delivers to the account owner until a domain is verified).
 *
 * The Resend call is awaited deliberately: on Netlify the function invocation
 * can be frozen as soon as the response is returned, which would drop a
 * fire-and-forget request before the email ever sends.
 */
export async function sendOtpEmail(email: string, otp: string, type: OtpType): Promise<void> {
	if (isDev || !env.RESEND_API_KEY) {
		console.info(`[email-otp] ${type} code for ${email}: ${otp}`);
		return;
	}

	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from: env.RESEND_FROM || 'TAG Archive <onboarding@resend.dev>',
			to: [email],
			subject: `${otp} is your TAG Archive sign-in code`,
			text: `Your sign-in code is ${otp}. It expires in 5 minutes.\n\nIf you didn't request this, you can ignore this email.`
		})
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Resend request failed (${res.status}): ${body}`);
	}
}
