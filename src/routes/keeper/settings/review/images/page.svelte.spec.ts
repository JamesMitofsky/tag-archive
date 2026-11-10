import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';
import { paintedCanvas } from '$lib/testing/scanner';

// Rendered without a running app: stand in for what SvelteKit would provide.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/keeper/settings/review/images') }
}));

const { default: ReviewPage } = await import('./+page.svelte');
type Props = ComponentProps<typeof ReviewPage>;

const pixel = paintedCanvas(8, 8).toDataURL('image/png');
const thumbnails = (count: number) =>
	Array.from({ length: count }, (_, index) => ({ id: index + 1, url: pixel, width: 8, height: 8 }));

function renderReview(sets: unknown[]) {
	const data = { user: { email: 'admin@example.org', role: 'admin' }, sets };
	return render(ReviewPage, { data } as unknown as Props);
}

describe('/keeper/settings/review/images', () => {
	it('shows each set with a glance at its photographs and who sent it', async () => {
		renderReview([
			{
				id: 3,
				description: 'Front row',
				event: 'Vetted Concert',
				date: '2024-06-01',
				count: 10,
				thumbnails: thumbnails(8),
				fromKeeper: false,
				contactName: 'Ada',
				contactEmail: 'ada@example.org'
			},
			{
				id: 4,
				description: null,
				event: null,
				date: null,
				count: 1,
				thumbnails: thumbnails(1),
				fromKeeper: true,
				contactName: null,
				contactEmail: null
			}
		]);

		await expect.element(page.getByText('2 image sets awaiting approval.')).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Vetted Concert' }))
			.toHaveAttribute('href', '/keeper/images/3');
		await expect.element(page.getByText('June 1, 2024 · 10 photographs')).toBeVisible();
		await expect.element(page.getByText('+2 more')).toBeVisible();
		await expect
			.element(page.getByText('From the public · Contact: Ada, ada@example.org'))
			.toBeVisible();

		await expect.element(page.getByRole('link', { name: '1 photograph' })).toBeVisible();
		await expect.element(page.getByText('From a signed-in contributor')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Approve' }).first()).toBeVisible();
		expect(document.querySelectorAll('li img')).toHaveLength(9);
	});

	it('says when nothing is waiting', async () => {
		renderReview([]);
		await expect.element(page.getByText('No images awaiting review.')).toBeVisible();
	});
});
