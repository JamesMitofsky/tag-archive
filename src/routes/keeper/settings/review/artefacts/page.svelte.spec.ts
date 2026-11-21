import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';

// Rendered without a running app: stand in for what SvelteKit would provide.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/keeper/settings/review/artefacts') }
}));

const { default: ReviewPage } = await import('./+page.svelte');
type Props = ComponentProps<typeof ReviewPage>;

const proposed = (overrides: Record<string, unknown>) => ({
	id: 1,
	artefact: 'Concert Program',
	event: null,
	date: '2024-06-01',
	description: null,
	fileUrls: [],
	location: 'Binder',
	provenance: [],
	createdBy: null,
	...overrides
});

function renderReview(artefacts: unknown[]) {
	const data = { user: { email: 'admin@example.org', role: 'admin' }, artefacts };
	return render(ReviewPage, { data } as unknown as Props);
}

describe('/keeper/settings/review/artefacts', () => {
	it('shows each artefact with its scans on the card', async () => {
		await renderReview([
			proposed({
				id: 3,
				fileUrls: ['/artefacts/front.webp', '/artefacts/back.webp', '/artefacts/notes.pdf']
			}),
			proposed({ id: 4, artefact: 'Ticket Stub', createdBy: 'user-1' })
		]);

		await expect.element(page.getByText('2 artefacts awaiting approval.')).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Concert Program', exact: true }))
			.toHaveAttribute('href', '/keeper/artefacts/3');

		// Every scan is on the card, each a link to its original.
		const scans = [...document.querySelectorAll<HTMLImageElement>('li img')];
		expect(scans.map((scan) => scan.getAttribute('src'))).toEqual([
			'/artefacts/front.webp',
			'/artefacts/back.webp'
		]);
		expect(scans.map((scan) => scan.closest('a')?.getAttribute('href'))).toEqual([
			'/artefacts/front.webp',
			'/artefacts/back.webp'
		]);
		// A file that is not an image stays a link.
		await expect
			.element(page.getByRole('link', { name: 'Open file' }))
			.toHaveAttribute('href', '/artefacts/notes.pdf');

		await expect.element(page.getByText('From a signed-in contributor')).toBeVisible();
	});

	it('says when nothing is waiting', async () => {
		await renderReview([]);
		await expect.element(page.getByText('No artefacts awaiting review.')).toBeVisible();
	});
});
