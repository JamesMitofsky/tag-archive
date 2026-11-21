import { RESEND_API_KEY, RESEND_FROM } from '$app/env/private';
import { render } from 'svelte/server';
import type { Component } from 'svelte';
import { otpEmailSubject, accountCreatedEmailSubject } from './emails/subjects';

/**
 * Low-level send. Whether a message is delivered or logged keys off
 * RESEND_API_KEY alone: with the key we send via Resend, otherwise we log to the
 * server console so the auth flows stay testable against seeded accounts in
 * local dev. We deliberately do NOT gate on NODE_ENV — a serverless host only
 * guarantees it at build time, not inside the function runtime where
 * $app/env/private reads, so relying on it once silently downgraded prod to
 * console-logging.
 *
 * Note: Resend's free tier only delivers to the account owner until a domain is
 * verified, so seeded test recipients bounce even with a key set.
 *
 * The Resend call is awaited deliberately: a Vercel Function can be frozen as
 * soon as the response is returned, which would drop a fire-and-forget request
 * before the email ever sends.
 */
async function sendEmail(opts: {
	to: string;
	subject: string;
	html: string;
	text: string;
	logTag: string;
	logLine: string;
	attachments?: InlineImage[];
}): Promise<void> {
	if (!RESEND_API_KEY) {
		console.info(`[${opts.logTag}] ${opts.logLine}`);
		return;
	}

	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${RESEND_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from: RESEND_FROM || 'TAG Archive <onboarding@resend.dev>',
			to: [opts.to],
			subject: opts.subject,
			html: opts.html,
			text: opts.text,
			attachments: opts.attachments
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

/**
 * An attachment in the shape Resend's REST API takes (`POST /emails`). One with
 * a `content_id` is sent inline, and the HTML shows it as `cid:<content_id>`.
 */
type InlineImage = {
	filename: string;
	/** The file's bytes, base64-encoded. */
	content: string;
	content_type: string;
	content_id: string;
};

/** What the wordmark's `<img src>` reads in a sent email. */
const WORDMARK_CID = 'tag-archive-wordmark';
export const WORDMARK_SRC = `cid:${WORDMARK_CID}`;

/**
 * The handwritten wordmark, attached to the email itself rather than linked.
 * A linked image only shows if the reader's mail client can fetch it, and that
 * depends on things the email can't control: an origin the phone can't reach
 * (a local dev server's localhost), a host that refuses the fetch, or a client
 * that blocks remote images. An inline attachment arrives with the message.
 *
 * Vite bundles the PNG into the server build as a base64 data URI (`?inline`),
 * so nothing is read from disk or fetched at send time. Imported dynamically
 * for the same reason as the templates (see renderEmail).
 */
async function wordmarkAttachment(): Promise<InlineImage> {
	const { default: dataUri } = await import('./emails/wordmark.png?inline');
	const prefix = 'data:image/png;base64,';
	if (!dataUri.startsWith(prefix)) {
		throw new Error('The email wordmark was not bundled as a base64 PNG data URI');
	}
	return {
		filename: 'tag-archive.png',
		content: dataUri.slice(prefix.length),
		content_type: 'image/png',
		content_id: WORDMARK_CID
	};
}

/** Delivers a one-time sign-in code. OTP sign-in is the only OTP flow here. */
export async function sendOtpEmail(email: string, otp: string): Promise<void> {
	const { default: OtpEmail } = await import('./emails/OtpEmail.svelte');
	await sendEmail({
		to: email,
		subject: otpEmailSubject(otp),
		html: renderEmail(OtpEmail, { otp, logoSrc: WORDMARK_SRC }),
		text: `Your sign-in code is ${otp}. It expires in 5 minutes.\n\nIf you didn't request this, you can ignore this email.`,
		attachments: [await wordmarkAttachment()],
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
		subject: accountCreatedEmailSubject,
		html: renderEmail(AccountCreatedEmail, { signInUrl, logoSrc: WORDMARK_SRC }),
		text: `An account has been created for this email at TAG Archive.\n\nSign in: ${signInUrl}`,
		attachments: [await wordmarkAttachment()],
		logTag: 'email-account-created',
		logLine: `account created for ${email}`
	});
}
