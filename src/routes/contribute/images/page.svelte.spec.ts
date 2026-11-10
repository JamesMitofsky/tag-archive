import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import { canvasPhoto, fakeImageServer } from '$lib/testing/images';

// Rendered without a running app: stand in for what SvelteKit would provide,
// keeping hold of what the page hands `use:enhance` for its own form.
const enhanced = vi.hoisted(() => ({ submit: undefined as SubmitFunction | undefined }));
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: SubmitFunction) => {
		if (form.getAttribute('action') === '?/createImageSet') enhanced.submit = submit;
		return { destroy() {} };
	}
}));
vi.mock('$app/navigation', () => ({
	afterNavigate: () => {},
	beforeNavigate: () => {},
	goto: vi.fn()
}));
// The event combobox loads the public dataset; nothing to pick from here.
vi.mock('$lib/dataset', () => ({ loadEvents: async () => [] }));

const { default: ImagesPage } = await import('./+page.svelte');
type Props = ComponentProps<typeof ImagesPage>;

afterEach(() => {
	vi.restoreAllMocks();
});

function renderPage(form: Record<string, unknown> | null = null) {
	const data = { signedIn: false, canContribute: true };
	const rendered = render(ImagesPage, { data, form } as unknown as Props);
	return {
		...rendered,
		/** As SvelteKit applies an action's result: `form` cleared for a tick, then set. */
		async apply(result: Record<string, unknown>) {
			await rendered.rerender({ form: null } as Partial<Props>);
			await rendered.rerender({ form: result } as Partial<Props>);
		}
	};
}

const picker = () => page.getByLabelText('Add photographs');
const addToArchive = () => page.getByRole('button', { name: 'Add to the archive' });

/** Submit the way an Enter key press in a field would, past the button. */
async function pressEnter() {
	const form = document.querySelector<HTMLFormElement>('form[action="?/createImageSet"]')!;
	const cancel = vi.fn();
	await enhanced.submit!({
		formData: new FormData(form),
		formElement: form,
		action: new URL('http://localhost/contribute/images?/createImageSet'),
		cancel,
		controller: new AbortController(),
		submitter: null
	});
	return cancel;
}

describe('/contribute/images', () => {
	it('holds the submit while any photograph failed to upload, until each is tried again or removed', async () => {
		const server = fakeImageServer();
		renderPage();
		await picker().upload(await canvasPhoto('kept.png'));
		await expect.element(addToArchive()).toBeEnabled();

		// The visit lapses: the next two are stopped, the first stays uploaded.
		server.control.locked = true;
		await picker().upload([await canvasPhoto('a.png'), await canvasPhoto('b.png')]);
		await vi.waitFor(() => expect(page.getByText('Not uploaded').all()).toHaveLength(2));

		await expect.element(addToArchive()).toBeDisabled();
		await expect
			.element(page.getByText('2 photographs weren’t uploaded.'))
			.toHaveTextContent(
				'2 photographs weren’t uploaded. Try them again, or remove them, before adding to the archive.'
			);
		expect(await pressEnter()).toHaveBeenCalled();

		server.control.locked = false;
		await page.getByRole('button', { name: 'Retry photograph 2' }).click();
		await expect
			.element(page.getByText('1 photograph wasn’t uploaded.'))
			.toHaveTextContent(
				'1 photograph wasn’t uploaded. Try it again, or remove it, before adding to the archive.'
			);
		await vi.waitFor(() => expect(server.finalized).toHaveLength(2));
		await expect.element(addToArchive()).toBeDisabled();

		await page.getByRole('button', { name: 'Remove photograph 3' }).click();
		await expect.element(addToArchive()).toBeEnabled();
		await expect
			.element(page.getByText(/wasn’t uploaded|weren’t uploaded/))
			.not.toBeInTheDocument();
		expect(await pressEnter()).not.toHaveBeenCalled();
		const form = document.querySelector<HTMLFormElement>('form[action="?/createImageSet"]')!;
		expect(new FormData(form).getAll('imageIds')).toEqual([
			String(server.idOf('kept.png')),
			String(server.idOf('a.png'))
		]);
	});

	it('keeps the thank-you, and what was typed into its contact form, through a refusal', async () => {
		const { apply } = renderPage();
		const submitted = { id: 5, token: 'token-5' };
		await apply({ submitted });
		await page.getByRole('button', { name: /Leave a name or email/ }).click();
		await page.getByLabelText('Name').fill('Ada');
		await page.getByLabelText('Email').fill('ada@example.org');

		await apply({ contactError: 'That submission has already been reviewed.', submitted });

		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('That submission has already been reviewed.');
		await expect.element(page.getByLabelText('Name')).toHaveValue('Ada');
		await expect.element(page.getByLabelText('Email')).toHaveValue('ada@example.org');
		await expect.element(page.getByRole('heading', { name: 'Thank you' })).toBeInTheDocument();

		// An expired token echoes nothing back, and still leaves the thank-you up to say so.
		await apply({ contactError: 'That link has expired.' });
		await expect.element(page.getByRole('alert')).toHaveTextContent('That link has expired.');
		await expect.element(page.getByLabelText('Name')).toHaveValue('Ada');

		await apply({ connected: true, submitted });
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent('Thanks — a keeper may be in touch about these photographs.');
	});
});
