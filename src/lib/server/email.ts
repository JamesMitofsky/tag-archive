import { env } from '$env/dynamic/private';
import { render } from 'svelte/server';
import type { OtpEmailType } from './emails/OtpEmail.svelte';

type OtpType = OtpEmailType;

/**
 * Delivers a one-time password via Resend.
 *
 * Whether the code is sent or logged keys off RESEND_API_KEY alone: when the
 * key is present we send, otherwise we log the code to the server console so
 * the OTP flow stays testable against the seeded test accounts in local dev.
 * We deliberately do NOT gate on NODE_ENV — Netlify only guarantees it at
 * build time, not inside the function runtime where $env/dynamic/private
 * reads, so relying on it silently downgraded prod to console-logging.
 *
 * Note: Resend's free tier only delivers to the account owner until a domain
 * is verified, so seeded test recipients bounce even with a key set.
 *
 * The Resend call is awaited deliberately: on Netlify the function invocation
 * can be frozen as soon as the response is returned, which would drop a
 * fire-and-forget request before the email ever sends.
 */
export async function sendOtpEmail(email: string, otp: string, type: OtpType): Promise<void> {
	if (!env.RESEND_API_KEY) {
		console.info(`[email-otp] ${type} code for ${email}: ${otp}`);
		return;
	}

	// Render the Svelte email template to a static HTML string. `render()` from
	// svelte/server is the Svelte-5-native way to do the svelte-email pattern —
	// no extra dependency, and the template inlines its own email-safe styles.
	// The component is imported dynamically so the top-level module graph stays
	// free of the `.svelte` value import: the better-auth CLI loads auth.ts (which
	// imports this file) through jiti/Node, which can't parse `.svelte` and would
	// otherwise crash `auth:schema` with ERR_UNKNOWN_FILE_EXTENSION. Vite resolves
	// this dynamic import fine at runtime.
	const { default: OtpEmail } = await import('./emails/OtpEmail.svelte');
	const { body } = render(OtpEmail, { props: { otp, type } });
	const html = `<!DOCTYPE html>${body}`;

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
			html,
			// Plain-text fallback for clients that don't render HTML.
			text: `Your sign-in code is ${otp}. It expires in 5 minutes.\n\nIf you didn't request this, you can ignore this email.`
		})
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Resend request failed (${res.status}): ${body}`);
	}
}
