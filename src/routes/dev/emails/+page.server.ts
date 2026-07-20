import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { render } from 'svelte/server';
import OtpEmail from '$lib/server/emails/OtpEmail.svelte';
import AccountCreatedEmail from '$lib/server/emails/AccountCreatedEmail.svelte';
import { otpEmailSubject, accountCreatedEmailSubject } from '$lib/server/emails/subjects';
import type { PageServerLoad } from './$types';

// Dev-only email gallery: renders every template to HTML so they can be
// previewed in the browser without sending mail. 404s in production builds.
export const load: PageServerLoad = () => {
	if (!dev) throw error(404, 'Not found');

	// Random 6-digit code so the preview reflects real, varied digits each reload.
	const otp = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');

	// Relative path resolves against the app origin inside the srcdoc iframe;
	// real sends use an absolute ORIGIN-based URL (see email.ts).
	const logoUrl = '/email/temperance-alley-archive.png';

	const previews = [
		{
			label: 'OtpEmail — sign-in',
			subject: otpEmailSubject(otp),
			html: `<!DOCTYPE html>${render(OtpEmail, { props: { otp, logoUrl } }).body}`
		},
		{
			label: 'AccountCreatedEmail',
			subject: accountCreatedEmailSubject,
			html: `<!DOCTYPE html>${render(AccountCreatedEmail, { props: { signInUrl: 'https://example.com/keeper', logoUrl } }).body}`
		}
	];

	return { previews };
};
