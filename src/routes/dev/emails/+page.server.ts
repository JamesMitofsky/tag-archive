import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { render } from 'svelte/server';
import OtpEmail from '$lib/server/emails/OtpEmail.svelte';
import AccountCreatedEmail from '$lib/server/emails/AccountCreatedEmail.svelte';
import type { PageServerLoad } from './$types';

// Dev-only email gallery: renders every template to HTML so they can be
// previewed in the browser without sending mail. 404s in production builds.
export const load: PageServerLoad = () => {
	if (!dev) throw error(404, 'Not found');

	const previews = [
		{
			label: 'OtpEmail — sign-in',
			html: `<!DOCTYPE html>${render(OtpEmail, { props: { otp: '123456' } }).body}`
		},
		{
			label: 'AccountCreatedEmail — contributor',
			html: `<!DOCTYPE html>${render(AccountCreatedEmail, { props: { name: 'Ada Lovelace', role: 'contributor', signInUrl: 'https://example.com/keeper' } }).body}`
		},
		{
			label: 'AccountCreatedEmail — admin',
			html: `<!DOCTYPE html>${render(AccountCreatedEmail, { props: { name: 'Grace Hopper', role: 'admin', signInUrl: 'https://example.com/keeper' } }).body}`
		}
	];

	return { previews };
};
