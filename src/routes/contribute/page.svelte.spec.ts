import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';

// Rendered without a running app: stand in for what SvelteKit would provide.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('$app/navigation', () => ({
	afterNavigate: () => {},
	beforeNavigate: () => {},
	goto: vi.fn(),
	onNavigate: () => {},
	pushState: vi.fn()
}));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/contribute'), state: {} } }));
// The comboboxes load the public dataset; nothing to pick from here.
vi.mock('$lib/dataset', () => ({ loadEvents: async () => [], loadPeople: async () => [] }));

const { default: ContributePage } = await import('./+page.svelte');
type Props = ComponentProps<typeof ContributePage>;

describe('/contribute', () => {
	const data = { signedIn: false, canContribute: true, requireLocation: false, locations: [] };

	it('shows the archive number to write on the item in place of the form', async () => {
		render(ContributePage, { data, form: { submitted: { id: 42 } } } as unknown as Props);

		await expect
			.element(page.getByRole('heading', { name: 'Write this number on the item' }))
			.toHaveFocus();
		await expect.element(page.getByText('#42')).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Copy archive number' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('link', { name: 'Add another' }))
			.toHaveAttribute('href', '/contribute');
		// Only what's needed to label the item: no thank-you copy, no contact form.
		expect(document.querySelector('form')).toBeNull();
		expect(document.body.textContent).not.toMatch(/thank you|name or email/i);
	});

	it('goes back to the form once a navigation clears the result', async () => {
		const { rerender } = render(ContributePage, {
			data,
			form: { submitted: { id: 6 } }
		} as unknown as Props);
		await expect.element(page.getByText('#6')).toBeVisible();

		// The nav's Cloud Keeper mark links here: a navigation, which clears `form`.
		await rerender({ form: null } as Partial<Props>);
		await expect
			.element(page.getByRole('heading', { name: 'Add to the archive' }))
			.toBeInTheDocument();
	});
});
