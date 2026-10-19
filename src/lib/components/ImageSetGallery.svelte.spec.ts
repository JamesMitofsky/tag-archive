import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ImageSetGallery from './ImageSetGallery.svelte';

const photo = (id: number) => ({ id, url: `/photos/${id}.webp`, width: 1200, height: 800 });

describe('ImageSetGallery.svelte', () => {
	it('shows every photograph in the set, each numbered in its alt text', async () => {
		render(ImageSetGallery, {
			images: [photo(1), photo(2), photo(3)],
			label: 'Summer Picnic',
			description: 'Everyone brought a dish.'
		});
		await expect.element(page.getByText('Summer Picnic')).toBeVisible();
		await expect.element(page.getByText('Everyone brought a dish.')).toBeVisible();
		for (const n of [1, 2, 3]) {
			await expect
				.element(page.getByRole('img', { name: `Summer Picnic, photograph ${n} of 3` }))
				.toBeInTheDocument();
		}
	});

	it('names a lone photograph for the set alone, and never repeats the label', async () => {
		const description = 'Picnic in the garden\nEveryone brought a dish.';
		const { container } = render(ImageSetGallery, {
			images: [photo(1)],
			label: 'Picnic in the garden',
			description
		});
		await expect
			.element(page.getByRole('img', { name: 'Picnic in the garden', exact: true }))
			.toBeInTheDocument();
		expect(container.textContent?.match(/Picnic in the garden/g)).toHaveLength(1);
		await expect.element(page.getByText('Everyone brought a dish.')).toBeVisible();
	});
});
