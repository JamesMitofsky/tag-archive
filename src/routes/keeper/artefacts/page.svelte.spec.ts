import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';

// Rendered without a running app: stand in for what SvelteKit would provide.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/keeper/artefacts') } }));

const { default: ArtefactsPage } = await import('./+page.svelte');
type Props = ComponentProps<typeof ArtefactsPage>;

const artefact = (id: number, title: string, proposedAddition: boolean) => ({
	id,
	artefact: title,
	date: '2026-10-12',
	description: null,
	event: null,
	location: null,
	fileUrls: [],
	programArea: [],
	provenance: [],
	proposedAddition
});

function renderList(role: string, form: unknown = null) {
	const data = {
		user: { email: 'someone@example.org', role },
		artefacts: [artefact(2, 'Pending zine', true), artefact(1, 'Vetted flyer', false)]
	};
	return render(ArtefactsPage, { data, form } as unknown as Props);
}

describe('/keeper/artefacts', () => {
	it('gives admins approve and reject buttons on proposed additions only', async () => {
		renderList('admin');

		await expect.element(page.getByText('Pending zine')).toBeVisible();
		await expect.element(page.getByText('Vetted flyer')).toBeVisible();
		// One pair, posting the pending artefact's id.
		await expect.element(page.getByRole('button', { name: 'Approve' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Reject' })).toBeVisible();
		const ids = document.querySelectorAll<HTMLInputElement>('form input[name="id"]');
		expect([...ids].map((input) => input.value)).toEqual(['2', '2']);
	});

	it('shows contributors the badge without the buttons', async () => {
		renderList('contributor');

		await expect.element(page.getByText('Proposed addition')).toBeVisible();
		expect(document.querySelector('form[action="?/approve"]')).toBeNull();
		expect(document.querySelector('form[action="?/reject"]')).toBeNull();
	});

	it('surfaces a refused review', async () => {
		renderList('admin', { reviewError: 'Only admins can review submissions' });

		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('Only admins can review submissions');
	});
});
