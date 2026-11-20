import { page, userEvent } from 'vitest/browser';
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
	onNavigate: () => {}
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/keeper/artefacts/new'), state: {} }
}));
// The comboboxes load the public dataset: two events to pick from, no people.
const EVENTS = [
	{ id: 0, title: 'Symphonic Steep', date: '2021-06-12' },
	{ id: 1, title: 'Morning Meditation', date: '2021-06-16' }
];
vi.mock('#lib/dataset.ts', () => ({ loadEvents: async () => EVENTS, loadPeople: async () => [] }));

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

	it('fills the date from the event picked, but never over a date set by hand', async () => {
		await render(NewArtefactPage, {
			data: { locations: [] },
			form: null
		} as unknown as Props);
		const date = () =>
			document.querySelector<HTMLInputElement>('input[type="hidden"][name="date"]')?.value;

		// The event comes before the date.
		const combo = page.getByPlaceholder('Search events');
		const fields = [...document.querySelectorAll('form [data-field]')];
		const eventIndex = fields.findIndex((el) => el.querySelector('[role="combobox"]'));
		const dateIndex = fields.findIndex((el) => el.querySelector('[data-popover-trigger]'));
		expect(eventIndex).toBeGreaterThanOrEqual(0);
		expect(eventIndex).toBeLessThan(dateIndex);

		await combo.click();
		await page.getByRole('option', { name: /Symphonic Steep/ }).click();
		await expect.poll(date).toBe('2021-06-12');
		await expect.element(page.getByRole('button', { name: 'June 12, 2021' })).toBeInTheDocument();

		// Another event moves a date it filled in itself. Typing straight after a
		// pick, with the field still focused, brings the list back.
		await combo.fill('Morning');
		await page.getByRole('option', { name: /Morning Meditation/ }).click();
		await expect.poll(date).toBe('2021-06-16');

		// A date picked by hand stays put when the event changes.
		await page.getByRole('button', { name: 'June 16, 2021' }).click();
		await page.getByRole('button', { name: 'Year', exact: true }).click();
		await page.getByRole('button', { name: '2019', exact: true }).click();
		await expect.poll(date).toBe('2019');
		await combo.fill('Symphonic');
		await page.getByRole('option', { name: /Symphonic Steep/ }).click();
		await expect.element(combo).toHaveValue('Symphonic Steep');
		expect(date()).toBe('2019');
	});
});

describe('/keeper/artefacts/new provenance', () => {
	const provenance = () => page.getByPlaceholder('Jane Doe');

	it('offers the names the page loaded, not only the public dataset', async () => {
		await render(NewArtefactPage, {
			data: { locations: [], people: ['Awaiting Review'] },
			form: null
		} as unknown as Props);

		await provenance().click();
		await expect.element(page.getByRole('option', { name: /Awaiting Review/ })).toBeVisible();
	});

	it('offers a name submitted earlier in this tab', async () => {
		sessionStorage.setItem('remembered-people', JSON.stringify(['From Last Time']));
		await render(NewArtefactPage, { data: { locations: [] }, form: null } as unknown as Props);

		await provenance().fill('last');
		await expect.element(page.getByRole('option', { name: /From Last Time/ })).toBeVisible();
	});

	it('still offers a new name after its tag is removed', async () => {
		await render(NewArtefactPage, { data: { locations: [] }, form: null } as unknown as Props);

		await provenance().fill('Brand New');
		await userEvent.keyboard('{Enter}');
		await page.getByRole('button', { name: 'Remove Brand New' }).click();

		await provenance().fill('brand');
		await expect.element(page.getByRole('option', { name: /Brand New\s*New/ })).toBeVisible();
	});
});

describe('/keeper/artefacts/new event', () => {
	const combo = () => page.getByPlaceholder('Search events');
	const submitted = () =>
		document.querySelector<HTMLInputElement>('input[type="hidden"][name="event"]')?.value;

	it('offers only existing events, and drops typed text that names none', async () => {
		await render(NewArtefactPage, { data: { locations: [] }, form: null } as unknown as Props);

		await combo().fill('A Picnic Nobody Listed');
		await expect.element(page.getByText('No event by that name.')).toBeVisible();
		expect(page.getByRole('option', { name: /Use/ }).query()).toBeNull();

		await page.getByRole('textbox', { name: /^Title/ }).click();
		await expect.element(combo()).toHaveValue('');
		expect(submitted()).toBe('');
	});

	it('takes a title typed out in full as that event', async () => {
		await render(NewArtefactPage, { data: { locations: [] }, form: null } as unknown as Props);

		await combo().fill('morning meditation');
		await page.getByRole('textbox', { name: /^Title/ }).click();

		await expect.element(combo()).toHaveValue('Morning Meditation');
		expect(submitted()).toBe('Morning Meditation');
	});

	it('keeps the event it held when the text is changed to nothing it knows', async () => {
		await render(NewArtefactPage, { data: { locations: [] }, form: null } as unknown as Props);

		await combo().click();
		await page.getByRole('option', { name: /Symphonic Steep/ }).click();
		await combo().fill('Symphonic Steeple');
		await page.getByRole('textbox', { name: /^Title/ }).click();

		await expect.element(combo()).toHaveValue('Symphonic Steep');
		expect(submitted()).toBe('Symphonic Steep');
	});
});

describe('/keeper/artefacts/new program areas', () => {
	it('explains the areas in the lookbook’s words from an info bubble', async () => {
		await render(NewArtefactPage, { data: { locations: [] }, form: null } as unknown as Props);

		// The bubble's button sits in the legend without joining the group's name.
		await expect.element(page.getByRole('group', { name: 'Program areas' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'What the program areas mean' }).click();

		const bubble = page.getByRole('dialog', { name: 'Program areas' });
		await expect.element(bubble.getByText('Cultivating craft in and for community.')).toBeVisible();
		await expect
			.element(bubble.getByText(/a gong bath——TAG has green medicine for all\.$/))
			.toBeInTheDocument();
		// TAG Committee has no lookbook entry, so the bubble says nothing of it.
		expect(bubble.getByText('TAG Committee').query()).toBeNull();
	});
});
