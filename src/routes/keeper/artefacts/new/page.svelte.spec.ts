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
// The comboboxes load the public dataset: two one-off events and one that
// recurs on four Saturdays, to pick from; no people.
const TEMPERANCE = 'Temperance Alley Beautification';
const EVENTS = [
	{ id: 1, title: 'Symphonic Steep', date: '2021-06-12' },
	{ id: 2, title: 'Morning Meditation', date: '2021-06-16' },
	{ id: 10, title: TEMPERANCE, date: '2021-04-17' },
	{ id: 11, title: TEMPERANCE, date: '2021-04-24' },
	{ id: 12, title: TEMPERANCE, date: '2021-05-01' },
	{ id: 13, title: TEMPERANCE, date: '2021-05-08' }
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
		const combo = page.getByPlaceholder('Search or add an event');
		const fields = [...document.querySelectorAll('form [data-field]')];
		const eventIndex = fields.findIndex((el) => el.querySelector('[role="combobox"]'));
		const dateIndex = fields.findIndex((el) => el.querySelector('[data-popover-trigger]'));
		expect(eventIndex).toBeGreaterThanOrEqual(0);
		expect(eventIndex).toBeLessThan(dateIndex);

		// The list opens on focus, so step out of the field and back in, as a
		// keeper would, to choose again.
		const pickAnother = async () => {
			await page.getByRole('textbox', { name: /^Title/ }).click();
			await combo.click();
			await combo.fill('');
		};

		await combo.click();
		await page.getByRole('option', { name: /Symphonic Steep/ }).click();
		await expect.poll(date).toBe('2021-06-12');
		await expect.element(page.getByRole('button', { name: 'June 12, 2021' })).toBeInTheDocument();

		// Another event moves a date it filled in itself.
		await pickAnother();
		await page.getByRole('option', { name: /Morning Meditation/ }).click();
		await expect.poll(date).toBe('2021-06-16');

		// A date picked by hand stays put when the event changes.
		await page.getByRole('button', { name: 'June 16, 2021' }).click();
		await page.getByRole('button', { name: 'Year', exact: true }).click();
		await page.getByRole('button', { name: '2019', exact: true }).click();
		await expect.poll(date).toBe('2019');
		await pickAnother();
		await page.getByRole('option', { name: /Symphonic Steep/ }).click();
		await expect.element(combo).toHaveValue('Symphonic Steep');
		expect(date()).toBe('2019');
	});

	it('lists each day of a recurring event, and posts the one picked', async () => {
		await render(NewArtefactPage, {
			data: { locations: [] },
			form: null
		} as unknown as Props);
		const hidden = (name: string) =>
			document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value;

		const combo = page.getByPlaceholder('Search or add an event');
		await combo.click();
		await combo.fill('Temperance');
		// One row per Saturday, not one for the title.
		await expect
			.poll(() => page.getByRole('option', { name: new RegExp(TEMPERANCE) }).all())
			.toHaveLength(4);

		await page.getByRole('option', { name: `${TEMPERANCE} May 1, 2021` }).click();

		await expect.element(combo).toHaveValue(TEMPERANCE);
		// That day, posted beside the title, filling the date and shown in the box.
		await expect.poll(() => hidden('eventId')).toBe('12');
		expect(hidden('event')).toBe(TEMPERANCE);
		await expect.poll(() => hidden('date')).toBe('2021-05-01');
		await expect.element(page.getByTestId('event-picked-date')).toHaveTextContent('May 1, 2021');

		// Change the text and it no longer names that day: the title alone goes.
		await combo.fill(`${TEMPERANCE} cleanup`);
		await expect.poll(() => hidden('eventId')).toBe('');
		expect(page.getByTestId('event-picked-date').query()).toBeNull();
	});

	it('keeps the day picked in the draft, and puts it back', async () => {
		const { unmount } = await render(NewArtefactPage, {
			data: { locations: [] },
			form: null
		} as unknown as Props);
		const combo = page.getByPlaceholder('Search or add an event');
		await combo.click();
		await combo.fill('Temperance');
		await page.getByRole('option', { name: `${TEMPERANCE} May 1, 2021` }).click();

		const key = 'artefact-draft:/keeper/artefacts/new';
		await expect
			.poll(() => JSON.parse(sessionStorage.getItem(key) ?? '{}'))
			.toMatchObject({ event: TEMPERANCE, eventId: '12', date: '2021-05-01' });
		unmount();

		await render(NewArtefactPage, {
			data: { locations: [] },
			form: null
		} as unknown as Props);
		await expect.element(page.getByText('Picked up where you left off.')).toBeInTheDocument();
		await expect
			.poll(
				() =>
					document.querySelector<HTMLInputElement>('input[type="hidden"][name="eventId"]')?.value
			)
			.toBe('12');
	});

	it('restores a draft kept before the picker posted an id, by its title alone', async () => {
		sessionStorage.setItem(
			'artefact-draft:/keeper/artefacts/new',
			JSON.stringify({
				artefact: 'Planting flyer',
				event: TEMPERANCE,
				date: '2021-05-01',
				description: '',
				location: '',
				fileUrls: [],
				provenance: '',
				programArea: []
			})
		);
		await render(NewArtefactPage, {
			data: { locations: [] },
			form: null
		} as unknown as Props);

		await expect.element(page.getByPlaceholder('Search or add an event')).toHaveValue(TEMPERANCE);
		expect(
			document.querySelector<HTMLInputElement>('input[type="hidden"][name="eventId"]')?.value
		).toBe('');
	});
});
