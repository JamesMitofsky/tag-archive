import { env } from '$env/dynamic/private';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

/**
 * Low-level send. Whether a message is delivered or logged keys off
 * RESEND_API_KEY alone: with the key we send via Resend, otherwise we log to the
 * server console so the auth flows stay testable against seeded accounts in
 * local dev. We deliberately do NOT gate on NODE_ENV — Netlify only guarantees
 * it at build time, not inside the function runtime where $env/dynamic/private
 * reads, so relying on it silently downgraded prod to console-logging.
 *
 * Note: Resend's free tier only delivers to the account owner until a domain is
 * verified, so seeded test recipients bounce even with a key set.
 *
 * The Resend call is awaited deliberately: on Netlify the function invocation
 * can be frozen as soon as the response is returned, which would drop a
 * fire-and-forget request before the email ever sends.
 */
async function sendEmail(opts: {
	to: string;
	subject: string;
	html: string;
	text: string;
	logTag: string;
	logLine: string;
}): Promise<void> {
	if (!env.RESEND_API_KEY) {
		console.info(`[${opts.logTag}] ${opts.logLine}`);
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
			to: [opts.to],
			subject: opts.subject,
			html: opts.html,
			text: opts.text
		})
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Resend request failed (${res.status}): ${body}`);
	}
}

/**
 * Render a Svelte email component to a static HTML document. `render()` from
 * svelte/server is the Svelte-5-native way to do the svelte-email pattern — no
 * extra dependency, and the templates inline their own email-safe styles.
 *
 * Components are imported dynamically at each call site so the top-level module
 * graph stays free of `.svelte` value imports: the better-auth CLI loads auth.ts
 * (which imports this file) through jiti/Node, which can't parse `.svelte` and
 * would otherwise crash `auth:schema` with ERR_UNKNOWN_FILE_EXTENSION. Vite
 * resolves the dynamic imports fine at runtime.
 */
function renderEmail<P extends Record<string, unknown>>(component: Component<P>, props: P): string {
	const { body } = render(component, { props });
	return `<!DOCTYPE html>${body}`;
}

/** Delivers a one-time sign-in code. OTP sign-in is the only OTP flow here. */
export async function sendOtpEmail(email: string, otp: string): Promise<void> {
	const { default: OtpEmail } = await import('./emails/OtpEmail.svelte');
	await sendEmail({
		to: email,
		subject: `${otp} is your TAG Archive sign-in code`,
		html: renderEmail(OtpEmail, { otp }),
		text: `Your sign-in code is ${otp}. It expires in 5 minutes.\n\nIf you didn't request this, you can ignore this email.`,
		logTag: 'email-otp',
		logLine: `sign-in code for ${email}: ${otp}`
	});
}

/**
 * Notifies someone that an admin created a Cloud Keeper account for them. The
 * `signInUrl` is a magic-link that signs them straight in (valid 7 days); once
 * it lapses the link lands them on /keeper to request a one-time code instead.
 * This app is passwordless — there's no password to set, they just follow the
 * link. Called from the magicLink plugin's sendMagicLink callback.
 */
export async function sendAccountCreatedEmail(email: string, signInUrl: string): Promise<void> {
	const { default: AccountCreatedEmail } = await import('./emails/AccountCreatedEmail.svelte');
	await sendEmail({
		to: email,
		subject: 'Your TAG Archive account is ready',
		html: renderEmail(AccountCreatedEmail, { signInUrl }),
		text: `An account has been created for this email at TAG Archive.\n\nSign in: ${signInUrl}`,
		logTag: 'email-account-created',
		logLine: `account created for ${email}`
	});
}
