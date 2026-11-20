import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';

// Rendered without a running app: stand in for what SvelteKit would provide.
// `enhance` is kept as the form's submit handler, so a test can press the
// button and see what the handler does before anything would be posted.
type Submit = (input: { formData: FormData; cancel: () => void }) => unknown;
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: Submit) => {
		const onSubmit = (event: SubmitEvent) => {
			event.preventDefault();
			submit({ formData: new FormData(form), cancel: () => {} });
		};
		form.addEventListener('submit', onSubmit);
		return { destroy: () => form.removeEventListener('submit', onSubmit) };
	}
}));
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
vi.mock('#lib/dataset.ts', () => ({ loadEvents: async () => [], loadPeople: async () => [] }));

const { default: NewArtefactPage } = await import('./+page.svelte');
type Props = ComponentProps<typeof NewArtefactPage>;

afterEach(() => {
	sessionStorage.clear();
});

describe('/keeper/artefacts/new', () => {
	it('posts to its own action, with the storage location required', async () => {
		await render(NewArtefactPage, {
			data: { locations: ['Binder 3'] },
			form: null
		} as unknown as Props);

		await expect.element(page.getByRole('heading', { name: 'New artefact' })).toBeInTheDocument();
		const form = document.querySelector('form');
		// Its own action, not the public one at /contribute.
		expect(form?.getAttribute('action')).toBe('?/createArtefact');
		await expect.element(page.getByText('Archival storage location *')).toBeInTheDocument();
	});

	it('says what is missing when the button is pressed on an empty form', async () => {
		await render(NewArtefactPage, {
			data: { locations: [] },
			form: null
		} as unknown as Props);

		// Never disabled: a button that can't be pressed can't explain itself.
		const submit = page.getByRole('button', { name: 'Add artefact' });
		await expect.element(submit).toBeEnabled();
		expect(page.getByText('Title required').query()).toBeNull();

		await submit.click();

		await expect.element(page.getByText('Title required')).toBeInTheDocument();
		await expect.element(page.getByText('Attach at least one image')).toBeInTheDocument();
		await expect.element(page.getByText('Archival storage location required')).toBeInTheDocument();
	});

	it('puts back a draft kept from before the tab was reloaded', async () => {
		sessionStorage.setItem(
			'artefact-draft:/keeper/artefacts/new',
			JSON.stringify({
				artefact: 'Symphonic Steep Program',
				event: '',
				date: '',
				description: 'Found in the blue folder',
				location: 'Binder 3',
				fileUrls: ['https://example.com/kept.webp'],
				provenance: 'Ada Example',
				programArea: []
			})
		);
		await render(NewArtefactPage, {
			data: { locations: ['Binder 3'] },
			form: null
		} as unknown as Props);

		await expect.element(page.getByText('Picked up where you left off.')).toBeInTheDocument();
		await expect
			.element(page.getByRole('textbox', { name: /^Title/ }))
			.toHaveValue('Symphonic Steep Program');
		await expect
			.element(page.getByRole('textbox', { name: 'Description' }))
			.toHaveValue('Found in the blue folder');
		await expect.element(page.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
		await expect.element(page.getByText('Ada Example')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Start over' }).click();

		await expect.element(page.getByRole('textbox', { name: /^Title/ })).toHaveValue('');
		expect(page.getByRole('img', { name: 'Page 1' }).query()).toBeNull();
		expect(sessionStorage.getItem('artefact-draft:/keeper/artefacts/new')).toBeNull();
	});
});
