import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import OtpEmail from './OtpEmail.svelte';

describe('OtpEmail', () => {
	it('renders the code and sign-in copy into static HTML', () => {
		const { body } = render(OtpEmail, { props: { otp: '123456' } });
		expect(body).toContain('123456');
		expect(body).toContain('Use this code to log-in:');
		// Email-safe: inline styles, no Tailwind classes or oklch() leaking through.
		expect(body).toContain('style=');
		expect(body).not.toContain('oklch(');
	});
});
