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

	it('picks the storage location from radio buttons, presets first', async () => {
		await render(NewArtefactPage, {
			data: { locations: ['binder', 'Binder 3'] },
			form: null
		} as unknown as Props);

		const group = page.getByRole('group', { name: 'Archival storage location *' });
		const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="location"]')];
		// A location in use that only differs by case is the preset, not a second radio.
		expect(radios.map((r) => r.parentElement?.textContent?.trim())).toEqual([
			'Binder',
			'Bin',
			'Binder 3',
			'Other…'
		]);
		// Required for keepers, so nothing is picked for them and there is no “Not sure”.
		expect(radios.some((r) => r.checked)).toBe(false);
		expect(group.getByRole('radio', { name: 'Not sure' }).query()).toBeNull();

		await group.getByRole('radio', { name: 'Bin', exact: true }).click();
		await expect.element(group.getByRole('radio', { name: 'Bin', exact: true })).toBeChecked();
		expect(new FormData(document.querySelector('form')!).get('location')).toBe('Bin');
	});

	it('takes a location typed into “Other…”, in an existing spelling when it names one', async () => {
		await render(NewArtefactPage, {
			data: { locations: [] },
			form: null
		} as unknown as Props);
		const posted = () => new FormData(document.querySelector('form')!).getAll('location');

		const textbox = page.getByRole('textbox', { name: 'Other storage location' });
		expect(textbox.query()).toBeNull();

		await page.getByRole('radio', { name: 'Other…' }).click();
		await expect.element(textbox).toHaveFocus();
		await textbox.fill('Flat file drawer');
		expect(posted()).toEqual(['Flat file drawer']);

		await textbox.fill('bin');
		expect(posted()).toEqual(['Bin']);

		// Emptied, it is no location at all, which a keeper may not save.
		await textbox.fill('');
		await page.getByRole('button', { name: 'Add artefact' }).click();
		await expect.element(page.getByText('Archival storage location required')).toBeInTheDocument();

		// Picking a preset closes the text box.
		await page.getByRole('radio', { name: 'Binder' }).click();
		expect(textbox.query()).toBeNull();
		expect(posted()).toEqual(['Binder']);
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
		await expect.element(page.getByRole('radio', { name: 'Binder 3' })).toBeChecked();

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

	it('opens the date picker on the first tap after an event filled the date', async () => {
		await render(NewArtefactPage, {
			data: { locations: [] },
			form: null
		} as unknown as Props);

		await page.getByPlaceholder('Search events').click();
		await page.getByRole('option', { name: /Symphonic Steep/ }).click();
		const trigger = page.getByRole('button', { name: 'June 12, 2021' });
		await expect.element(trigger).toBeInTheDocument();

		// Out to another field, then one tap on the date. Leaving the empty title
		// reveals its error above the date, but only once the tap has landed: shown
		// mid-press, it pushed the date button out from under the pointer.
		await page.getByRole('textbox', { name: /^Title/ }).click();
		await trigger.click();
		await expect.element(page.getByRole('button', { name: 'Year', exact: true })).toBeVisible();
		await expect.element(page.getByText('Title required')).toBeVisible();
	});

	it('lists each day of a recurring event, and posts the one picked', async () => {
		await render(NewArtefactPage, {
			data: { locations: [] },
			form: null
		} as unknown as Props);
		const hidden = (name: string) =>
			document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value;

		const combo = page.getByPlaceholder('Search events');
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

		// Passing through the field without a change keeps that day, even once
		// the list would put another Saturday first: with the date moved to 2019,
		// April 17 now sorts nearest.
		const leave = () => page.getByRole('textbox', { name: /^Title/ }).click();
		await page.getByRole('button', { name: 'May 1, 2021', exact: true }).click();
		await page.getByRole('button', { name: 'Year', exact: true }).click();
		await page.getByRole('button', { name: '2019', exact: true }).click();
		await expect.poll(() => hidden('date')).toBe('2019');
		await combo.click();
		await leave();
		expect(hidden('eventId')).toBe('12');
		await expect.element(page.getByTestId('event-picked-date')).toHaveTextContent('May 1, 2021');

		// Text that names no event goes back to that day on leaving the field.
		await combo.fill(`${TEMPERANCE} cleanup`);
		await leave();
		await expect.element(combo).toHaveValue(TEMPERANCE);
		expect(hidden('eventId')).toBe('12');

		// Emptied, it links nothing.
		await combo.fill('');
		await leave();
		await expect.poll(() => hidden('eventId')).toBe('');
		expect(hidden('event')).toBe('');
		expect(page.getByTestId('event-picked-date').query()).toBeNull();
	});

	it('keeps the day picked in the draft, and puts it back', async () => {
		const { unmount } = await render(NewArtefactPage, {
			data: { locations: [] },
			form: null
		} as unknown as Props);
		const combo = page.getByPlaceholder('Search events');
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

		await expect.element(page.getByPlaceholder('Search events')).toHaveValue(TEMPERANCE);
		expect(
			document.querySelector<HTMLInputElement>('input[type="hidden"][name="eventId"]')?.value
		).toBe('');
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
