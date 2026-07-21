import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PageScanner from './PageScanner.svelte';

describe('PageScanner.svelte', () => {
	it('supports selecting multiple images without capture locking', async () => {
		render(PageScanner, {});

		const fileInput = page.getByLabelText('Add from photos');
		await expect.element(fileInput).toBeInTheDocument();

		// Check multi-image upload support
		const inputEl = document.querySelector('input[type="file"]') as HTMLInputElement | null;
		expect(inputEl).not.toBeNull();
		expect(inputEl?.hasAttribute('multiple')).toBe(true);
		expect(inputEl?.hasAttribute('capture')).toBe(false);
	});

	it('renders initial uploaded images', async () => {
		render(PageScanner, {
			initial: ['https://example.com/scan1.jpg', 'https://example.com/scan2.jpg']
		});

		const images = page.getByRole('img', { name: 'Attached scan' });
		await expect.element(images.first()).toBeInTheDocument();
	});
});
