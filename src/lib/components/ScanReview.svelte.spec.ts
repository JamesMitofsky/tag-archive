import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ScanReview from './ScanReview.svelte';
import { paintedCanvas } from '#lib/testing/scanner.ts';

// The wait for a photo whose page is still being found. The rest of the crop
// step is covered through PageScanner's specs.

const shots = [
	{ id: 'a', thumbUrl: paintedCanvas().toDataURL() },
	{ id: 'b', thumbUrl: paintedCanvas().toDataURL() }
];

function review(estimate: (id: string) => number | null) {
	const handlers = { onBack: vi.fn(), onDiscard: vi.fn(), onFinish: vi.fn() };
	render(ScanReview, {
		shots,
		// Never ready: the photo stays waited on for the whole test.
		load: () => new Promise<null>(() => {}),
		estimate,
		onChange: () => {},
		...handlers
	});
	return handlers;
}

it('says how long is left while the page is being found', async () => {
	review(() => 2400);
	await expect.element(page.getByTestId('wait-note')).toHaveTextContent('About 3 seconds left');
});

it('names no figure while there is nothing to base one on', async () => {
	review(() => null);
	await expect
		.element(page.getByTestId('wait-note'))
		.toHaveTextContent('Getting ready to find pages…');
});

it('holds Next while waiting, and leaves every other way on open', async () => {
	const { onBack, onDiscard, onFinish } = review(() => 2400);
	const next = page.getByRole('button', { name: 'Next photo' });
	await expect.element(next).toHaveAttribute('aria-disabled', 'true');
	await next.click({ force: true });
	await expect.element(page.getByText('Photo 1 of 2')).toBeInTheDocument();

	// Past the moment the step ignores taps carried over from the camera.
	const discard = page.getByRole('button', { name: 'Discard photo 1' });
	await expect.element(discard).not.toHaveAttribute('aria-disabled', 'true');
	await discard.click();
	expect(onDiscard).toHaveBeenCalledWith('a');

	await page.getByRole('button', { name: 'Add all 2' }).click();
	expect(onFinish).toHaveBeenCalledOnce();

	await page.getByRole('button', { name: 'Back to camera' }).click();
	expect(onBack).toHaveBeenCalledOnce();
});
