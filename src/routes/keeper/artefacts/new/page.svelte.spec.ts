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
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/keeper/artefacts/new'), state: {} }
}));
// The comboboxes load the public dataset; nothing to pick from here.
vi.mock('$lib/dataset', () => ({ loadEvents: async () => [], loadPeople: async () => [] }));

const { default: NewArtefactPage } = await import('./+page.svelte');
type Props = ComponentProps<typeof NewArtefactPage>;

describe('/keeper/artefacts/new', () => {
	it('posts to its own action, with the storage location required', async () => {
		render(NewArtefactPage, { data: { locations: ['Binder 3'] }, form: null } as unknown as Props);

		await expect.element(page.getByRole('heading', { name: 'New artefact' })).toBeInTheDocument();
		const form = document.querySelector('form');
		// Its own action, not the public one at /contribute.
		expect(form?.getAttribute('action')).toBe('?/createArtefact');
		await expect.element(page.getByText('Archival storage location *')).toBeInTheDocument();
		// Nothing filled in yet: the submit waits.
		await expect.element(page.getByRole('button', { name: 'Add artefact' })).toBeDisabled();
	});
});
