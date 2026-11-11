import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';
import { paintedCanvas } from '$lib/testing/scanner';

// Rendered without a running app: stand in for the page SvelteKit would provide.
const location = vi.hoisted(() => ({ url: new URL('http://localhost/keeper/images') }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return location.url;
		}
	}
}));

const { default: ListPage } = await import('./+page.svelte');
const { default: DetailPage } = await import('./[id]/+page.svelte');
type ListProps = ComponentProps<typeof ListPage>;
type DetailProps = ComponentProps<typeof DetailPage>;

const pixel = paintedCanvas(8, 8).toDataURL('image/png');
const user = { email: 'keeper@example.org', role: 'contributor' };

describe('/keeper/images', () => {
	function renderList(sets: unknown[]) {
		location.url = new URL('http://localhost/keeper/images');
		return render(ListPage, { data: { user, sets } } as unknown as ListProps);
	}

	const sets = [
		{
			id: 1,
			description: 'Front row\nThe band from the second song on.',
			event: 'Vetted Concert',
			date: '2024-06-01',
			proposedAddition: true,
			count: 2,
			cover: { url: pixel, width: 8, height: 8 }
		},
		{
			id: 2,
			description: null,
			event: null,
			date: null,
			proposedAddition: false,
			count: 1,
			cover: { url: pixel, width: 8, height: 8 }
		}
	];

	it('labels each set, dates it and counts its photographs', async () => {
		renderList(sets);
		await expect
			.element(page.getByRole('link', { name: 'Vetted Concert' }))
			.toHaveAttribute('href', '/keeper/images/1');
		await expect.element(page.getByText('June 1, 2024 · 2 photographs')).toBeVisible();
		await expect.element(page.getByText('Proposed addition')).toBeVisible();
		// Labeled by its count, which isn't then printed again.
		await expect.element(page.getByRole('link', { name: '1 photograph' })).toBeVisible();
		await expect.element(page.getByText('Undated', { exact: true })).toBeVisible();
	});

	it('filters by what a row reads as, formatted date included', async () => {
		renderList(sets);
		await page.getByLabelText('Search images').fill('june 1, 2024');
		await expect.element(page.getByRole('link', { name: 'Vetted Concert' })).toBeVisible();
		await expect.element(page.getByRole('link', { name: '1 photograph' })).not.toBeInTheDocument();

		await page.getByLabelText('Search images').fill('nothing like it');
		await expect.element(page.getByText('No images match “nothing like it”.')).toBeVisible();
	});

	it('keeps up as a search shrinks and regrows a long list', async () => {
		// KeeperList can hand a row an index the search has just filtered away;
		// the row must sit that frame out rather than throw.
		renderList(
			Array.from({ length: 60 }, (_, index) => ({
				...sets[1],
				id: index + 1,
				description: `Roll ${index + 1}`
			}))
		);
		const search = page.getByLabelText('Search images');
		const link = (name: string) => page.getByRole('link', { name, exact: true });
		await expect.element(link('Roll 1')).toBeVisible();

		await search.fill('Roll 7');
		await expect.element(link('Roll 7')).toBeVisible();
		await expect.element(link('Roll 1')).not.toBeInTheDocument();

		await search.fill('');
		await expect.element(link('Roll 1')).toBeVisible();
		await search.fill('Roll 59');
		await expect.element(link('Roll 59')).toBeVisible();
		await expect.element(link('Roll 1')).not.toBeInTheDocument();
	});

	it('says when there is nothing yet, pointing at the add button', async () => {
		renderList([]);
		await expect.element(page.getByText(/No photographs yet/)).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Add photographs' }))
			.toHaveAttribute('href', '/contribute/images');
	});
});

describe('/keeper/images/[id]', () => {
	const image = {
		id: 11,
		url: pixel,
		width: 2560,
		height: 1920,
		originalUrl: 'https://bucket.test/images/u/original.heic',
		originalType: 'image/heic',
		originalName: 'IMG_0001.HEIC',
		originalBytes: 3 * 1024 * 1024,
		capturedAt: '2024-06-01T20:05:09',
		capturedOffset: '-04:00',
		metadata: { gps: { latitude: 38.9, longitude: -77 } }
	};

	function renderDetail(
		set: Record<string, unknown> = {},
		{ role = 'contributor', search = '' } = {}
	) {
		location.url = new URL(`http://localhost/keeper/images/4${search}`);
		const data = {
			user: { ...user, role },
			set: {
				id: 4,
				description: 'Front row\nThe band from the second song on.',
				event: null,
				date: '2024-06-01',
				dateAuto: true,
				proposedAddition: false,
				images: [image, { ...image, id: 12, capturedAt: null, metadata: null, originalName: null }],
				...set
			}
		};
		return render(DetailPage, { data } as unknown as DetailProps);
	}

	it('titles the set by its label and prints the rest of the description', async () => {
		renderDetail();
		await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent('Front row');
		await expect.element(page.getByText('The band from the second song on.')).toBeVisible();
		await expect.element(page.getByText('June 1, 2024 · 2 photographs')).toBeVisible();
		// Only admins edit.
		await expect.element(page.getByTitle('Edit image set')).not.toBeInTheDocument();
	});

	it('details each photograph: when, what file, the original and its metadata', async () => {
		renderDetail({}, { role: 'admin' });
		await expect
			.element(page.getByTitle('Edit image set'))
			.toHaveAttribute('href', '/keeper/images/4/edit');
		await expect
			.element(page.getByText('Taken June 1, 2024 at 8:05:09 PM (UTC-04:00)'))
			.toBeVisible();
		await expect.element(page.getByText('Date taken not recorded')).toBeVisible();
		await expect.element(page.getByText('Original: HEIC · 3.0 MB · IMG_0001.HEIC')).toBeVisible();
		await expect.element(page.getByText('Display copy: 2560 × 1920').first()).toBeVisible();

		const download = page.getByRole('link', { name: 'Download original' }).first();
		await expect.element(download).toHaveAttribute('href', image.originalUrl);
		await expect.element(download).toHaveAttribute('target', '_blank');
		await expect.element(download).toHaveAttribute('rel', 'noopener');

		await page.getByText('Photo metadata', { exact: true }).click();
		await expect.element(page.getByText(/"latitude": 38.9/)).toBeVisible();
		await expect.element(page.getByText('No photo metadata recorded')).toBeVisible();

		// The gallery reserves each photograph's box before it loads.
		const shown = document.querySelector('figure img');
		expect([shown?.getAttribute('width'), shown?.getAttribute('height')]).toEqual(['2560', '1920']);
	});

	it('says a new set was added, and whether a review is still ahead', async () => {
		renderDetail({ proposedAddition: true }, { search: '?created' });
		await expect.element(page.getByRole('status')).toHaveTextContent(/Added to the archive/);
		await expect.element(page.getByRole('status')).toHaveTextContent(/awaits a keeper's approval/);
		await expect.element(page.getByText('Proposed addition')).toBeVisible();
	});
});
