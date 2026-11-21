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
	onNavigate: () => {}
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/keeper/images/new'), state: {} }
}));
// The event combobox loads the public dataset; nothing to pick from here.
vi.mock('#lib/dataset.ts', () => ({ loadEvents: async () => [], loadPeople: async () => [] }));

const { default: NewPhotographsPage } = await import('./+page.svelte');
type Props = ComponentProps<typeof NewPhotographsPage>;

describe('/keeper/images/new', () => {
	it('posts to its own action, holding the submit until a photograph is in', async () => {
		await render(NewPhotographsPage, { data: {}, form: null } as unknown as Props);

		await expect
			.element(page.getByRole('heading', { name: 'New photographs' }))
			.toBeInTheDocument();
		// Its own action, not the public one at /contribute/images.
		expect(document.querySelector('form')?.getAttribute('action')).toBe('?/createImageSet');
		await expect.element(page.getByRole('button', { name: 'Add to the archive' })).toBeDisabled();
	});
});
