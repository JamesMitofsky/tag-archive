import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { render } from 'svelte/server';
import OtpEmail, { type OtpEmailType } from '$lib/server/emails/OtpEmail.svelte';
import type { PageServerLoad } from './$types';

// Dev-only email gallery: renders every template variant to HTML so they can be
// previewed in the browser without sending mail. 404s in production builds.
// `sign-in` is the only real flow; the generic fallback covers the other union
// members the plugin could theoretically pass. Preview both states.
const OTP_TYPES: OtpEmailType[] = ['sign-in', 'email-verification'];

export const load: PageServerLoad = () => {
	if (!dev) throw error(404, 'Not found');

	const previews = OTP_TYPES.map((type) => {
		const { body } = render(OtpEmail, { props: { otp: '123456', type } });
		return { label: `OtpEmail — ${type}`, html: `<!DOCTYPE html>${body}` };
	});

	return { previews };
};
