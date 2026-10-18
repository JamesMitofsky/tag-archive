import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';
import type { UploadedImage } from '$lib/images/types';
import { paintedCanvas } from '$lib/testing/scanner';

// Rendered without a running app: stand in for what SvelteKit would provide.
vi.mock('$app/navigation', () => ({ beforeNavigate: () => {}, goto: vi.fn() }));
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/keeper/images/5/edit') }
}));
// The event combobox loads the public dataset; nothing to pick from here.
vi.mock('$lib/dataset', () => ({ loadEvents: async () => [] }));

const { default: EditPage } = await import('./+page.svelte');
type Props = ComponentProps<typeof EditPage>;

/** Photographs already in the set. Data URLs: nothing to fetch. */
const images: UploadedImage[] = [7, 8, 9].map((id) => ({
	id,
	url: paintedCanvas(8, 8).toDataURL('image/png'),
	originalUrl: `https://bucket.test/images/${id}/original.jpg`,
	width: 8,
	height: 8,
	capturedAt: null
}));

function renderEdit(
	set: Partial<Props['data']['set']> = {},
	photographDate: string | null = null,
	form: Record<string, unknown> | null = null
) {
	const data = {
		user: { email: 'admin@example.org', role: 'admin' },
		set: {
			id: 5,
			description: 'Garden party',
			event: null,
			date: '2023-07-02',
			dateAuto: true,
			images,
			...set
		},
		photographDate
	};
	return render(EditPage, { data, form } as unknown as Props);
}

const form = () => document.querySelector<HTMLFormElement>('form[action="?/updateImageSet"]')!;
const submitted = (name: string) => new FormData(form()).getAll(name);
const save = () => page.getByRole('button', { name: 'Save changes' });
const followsPhotographs = () =>
	page.getByRole('checkbox', { name: 'Date follows the photographs' });

describe('/keeper/images/[id]/edit', () => {
	it('submits the set’s photographs in order before the uploader has said a word', async () => {
		renderEdit();
		await expect.element(save()).toBeEnabled();
		expect(submitted('imageIds')).toEqual(['7', '8', '9']);
	});

	it('follows the uploader: reordered and removed photographs are what gets saved', async () => {
		renderEdit();
		await page.getByRole('button', { name: 'Move photograph 1 later' }).click();
		await page.getByRole('button', { name: 'Remove photograph 3' }).click();
		await expect.poll(() => submitted('imageIds')).toEqual(['8', '7']);

		// Nothing left to save as a set.
		await page.getByRole('button', { name: 'Remove photograph 1' }).click();
		await page.getByRole('button', { name: 'Remove photograph 1' }).click();
		await expect.poll(() => submitted('imageIds')).toEqual([]);
		await expect.element(save()).toBeDisabled();
	});

	it('shows the photographs’ date read-only while it follows them, submitting none', async () => {
		// What the photographs give now, not the stored date: they may have changed since.
		renderEdit({ date: '2023-07-02', dateAuto: true }, '2023-07-01');
		await expect.element(followsPhotographs()).toBeChecked();
		// Shown read-only; the hidden picker after it already holds the same date.
		await expect.element(page.getByText('July 1, 2023').first()).toBeVisible();
		await expect.element(page.getByText('July 1, 2023').last()).not.toBeVisible();
		expect(submitted('dateAuto')).toEqual(['on']);
		// The picker stays mounted (a disabled fieldset), so its field submits nothing.
		expect(document.querySelector('fieldset')?.hidden).toBe(true);
		expect(submitted('date')).toEqual([]);
	});

	it('hands the date over to the picker, seeded with what the photographs gave', async () => {
		// The date just shown read-only, not the stored one, should they ever differ.
		renderEdit({ date: '2023-07-02', dateAuto: true }, '2023-07-01');
		await followsPhotographs().click();

		await expect.element(page.getByRole('button', { name: 'July 1, 2023' })).toBeVisible();
		expect(submitted('dateAuto')).toEqual([]);
		expect(submitted('date')).toEqual(['2023-07-01']);
		await expect.element(save()).toBeEnabled();
	});

	it('comes back from a refused save with what was typed, and says why', async () => {
		renderEdit({}, '2023-07-02', {
			setError: 'That image set no longer exists.',
			values: { description: 'Typed before saving', event: '', date: '2019-07', dateAuto: false }
		});
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('That image set no longer exists.');
		await expect.element(page.getByLabelText('Description')).toHaveValue('Typed before saving');
		// The hand-set date it was sent with, not the stored one.
		await expect.element(followsPhotographs()).not.toBeChecked();
		expect(submitted('date')).toEqual(['2019-07']);
		// The photographs are still the set's own.
		expect(submitted('imageIds')).toEqual(['7', '8', '9']);
	});

	it('opens a hand-set undated set on "No date", the override intact', async () => {
		renderEdit({ date: null, dateAuto: false }, '2023-07-02');
		await expect.element(followsPhotographs()).not.toBeChecked();
		await expect.element(page.getByRole('button', { name: 'No date' })).toBeVisible();
		expect(submitted('date')).toEqual(['undated']);

		// Following the photographs and back again keeps the pick.
		await followsPhotographs().click();
		expect(submitted('date')).toEqual([]);
		await followsPhotographs().click();
		expect(submitted('date')).toEqual(['undated']);
	});
});
