import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import AccountCreatedEmail from './AccountCreatedEmail.svelte';

describe('AccountCreatedEmail', () => {
	it('renders the notice and sign-in link into static HTML', () => {
		const { body } = render(AccountCreatedEmail, {
			props: { signInUrl: 'https://archive.test/keeper' }
		});
		expect(body).toContain('An account has been created for this email');
		expect(body).toContain('https://archive.test/keeper');
		// Email-safe: inline styles, no Tailwind classes or oklch() leaking through.
		expect(body).toContain('style=');
		expect(body).not.toContain('oklch(');
	});
});
