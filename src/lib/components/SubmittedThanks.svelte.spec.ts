import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';

// Rendered without a running app: the contact form posts nowhere here.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

const { default: SubmittedThanks } = await import('./SubmittedThanks.svelte');
type Props = ComponentProps<typeof SubmittedThanks>;

const thanks: Props = {
	noun: 'artefact',
	anotherHref: '/contribute',
	idField: 'artefactId',
	submitted: { id: 5, token: 'token-5' }
};

const contactForm = () => document.querySelector<HTMLFormElement>('form[action="?/connect"]');
const openContact = () => page.getByRole('button', { name: /Leave a name or email/ }).click();
const nameField = () => page.getByLabelText('Name');
const emailField = () => page.getByLabelText('Email');

describe('SubmittedThanks.svelte', () => {
	it('thanks the contributor, with a way to leave contact details for this submission', async () => {
		render(SubmittedThanks, thanks);
		await expect.element(page.getByRole('heading', { name: 'Thank you' })).toHaveFocus();
		expect(contactForm()).toBeNull();

		await openContact();

		await expect.element(nameField()).toHaveFocus();
		const fields = new FormData(contactForm()!);
		expect(fields.get('artefactId')).toBe('5');
		expect(fields.get('token')).toBe('token-5');
	});

	it('keeps the form open through a refusal, with the error and what was typed', async () => {
		const { rerender } = render(SubmittedThanks, thanks);
		await openContact();
		await nameField().fill('Ada');
		await emailField().fill('ada@example.org');
		// Save, disabled while it was sending, has lost focus by the time the answer lands.
		(document.activeElement as HTMLElement).blur();

		await rerender({ contactError: 'That submission has already been reviewed.' });

		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('That submission has already been reviewed.');
		await expect.element(nameField()).toHaveValue('Ada');
		await expect.element(emailField()).toHaveValue('ada@example.org');
		await expect.element(nameField()).toHaveFocus();
	});

	it('opens the form on a refusal it is first shown with, so the refusal is seen', async () => {
		// As a page that renders the thank-you anew with the answer does (a no-JS post).
		render(SubmittedThanks, {
			...thanks,
			contactError: 'Too many attempts — wait a little and try again.'
		});

		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('Too many attempts — wait a little and try again.');
		await expect.element(nameField()).toHaveFocus();
	});

	it('opens the form on field errors alone, each under its field', async () => {
		render(SubmittedThanks, {
			...thanks,
			contactError: 'Enter a valid email address',
			contactErrors: { email: ['Enter a valid email address'] }
		});

		// Said once, under the field, rather than again as a summary.
		await expect.element(page.getByRole('alert')).toHaveTextContent('Enter a valid email address');
		expect(page.getByRole('alert').all()).toHaveLength(1);
		expect(emailField().element().closest('div')?.textContent).toContain(
			'Enter a valid email address'
		);
	});

	it('shows the confirmation once the details are saved', async () => {
		const { rerender } = render(SubmittedThanks, { ...thanks, noun: 'photographs', plural: true });
		await openContact();
		await nameField().fill('Ada');

		await rerender({ connected: true });

		const confirmation = page.getByRole('status');
		await expect
			.element(confirmation)
			.toHaveTextContent('Thanks — a keeper may be in touch about these photographs.');
		await expect.element(confirmation).toHaveFocus();
		expect(contactForm()).toBeNull();
	});
});
