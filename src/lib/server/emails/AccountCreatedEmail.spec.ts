import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import AccountCreatedEmail from './AccountCreatedEmail.svelte';

describe('AccountCreatedEmail', () => {
	it('renders the recipient, role, and sign-in link into static HTML', () => {
		const { body } = render(AccountCreatedEmail, {
			props: { name: 'Ada', role: 'contributor', signInUrl: 'https://archive.test/keeper' }
		});
		expect(body).toContain('Ada');
		expect(body).toContain('a contributor');
		expect(body).toContain('https://archive.test/keeper');
		// Email-safe: inline styles, no Tailwind classes or oklch() leaking through.
		expect(body).toContain('style=');
		expect(body).not.toContain('oklch(');
	});

	it('labels the admin role', () => {
		const { body } = render(AccountCreatedEmail, {
			props: { name: 'Grace', role: 'admin', signInUrl: 'https://archive.test/keeper' }
		});
		expect(body).toContain('an admin');
	});
});
