import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';

// Rendered without a running app: stand in for what SvelteKit would provide.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
/** `afterNavigate` callbacks the page registered, to play a navigation through. */
const navigated = vi.hoisted(() => [] as ((nav: { type: string }) => void)[]);
vi.mock('$app/navigation', () => ({
	afterNavigate: (callback: (nav: { type: string }) => void) => void navigated.push(callback),
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
	it('keeps the thank-you, and what was typed into its contact form, through a refusal', async () => {
		const submitted = { id: 5, token: 'token-5' };
		const data = { signedIn: false, canContribute: true, requireLocation: false, locations: [] };
		const { rerender } = render(ContributePage, { data, form: { submitted } } as unknown as Props);
		/** As SvelteKit applies an action's result: `form` cleared for a tick, then set. */
		const apply = async (result: Record<string, unknown>) => {
			await rerender({ form: null } as Partial<Props>);
			await rerender({ form: result } as Partial<Props>);
		};
		await page.getByRole('button', { name: /Leave a name or email/ }).click();
		await page.getByLabelText('Name').fill('Ada');

		await apply({ contactError: 'Too many attempts — wait a little and try again.', submitted });

		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('Too many attempts — wait a little and try again.');
		await expect.element(page.getByLabelText('Name')).toHaveValue('Ada');

		await apply({ connected: true, submitted });
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent('Thanks — a keeper may be in touch about this artefact.');
	});

	it('lets go of the thank-you on a real navigation back to the form', async () => {
		const submitted = { id: 6, token: 'token-6' };
		const data = { signedIn: false, canContribute: true, requireLocation: false, locations: [] };
		const { rerender } = render(ContributePage, { data, form: { submitted } } as unknown as Props);
		await expect.element(page.getByRole('heading', { name: 'Thank you' })).toBeInTheDocument();

		// Applying an action's result clears `form` without navigating: still thanked.
		await rerender({ form: null } as Partial<Props>);
		await expect.element(page.getByRole('heading', { name: 'Thank you' })).toBeInTheDocument();

		// The nav's Cloud Keeper mark links here: a navigation, which means "start again".
		for (const callback of navigated) callback({ type: 'link' });
		await expect
			.element(page.getByRole('heading', { name: 'Add to the archive' }))
			.toBeInTheDocument();
	});
});
