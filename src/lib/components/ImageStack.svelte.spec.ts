import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ImageStack from './ImageStack.svelte';
// The fit is CSS (Tailwind utilities and container units), so the app's own
// stylesheet has to be on the page for the geometry test to mean anything.
import '../../routes/layout.css';

const photo = (id: number, width = 1200, height = 800) => ({
	id,
	url: `/photos/${id}.webp`,
	width,
	height
});

/** Renders the stack in a closed card's box (192px, A4). */
function renderStack(images: ReturnType<typeof photo>[]) {
	const { container } = render(ImageStack, { images, alt: 'Summer Picnic' });
	container.style.width = '192px';
	container.style.height = `${192 * (297 / 210)}px`;
	return container;
}

const prints = (container: HTMLElement) => Array.from(container.querySelectorAll('img'));

describe('ImageStack.svelte', () => {
	it('shows a set of one as a lone print, named for the set', () => {
		const container = renderStack([photo(1)]);
		const imgs = prints(container);
		expect(imgs).toHaveLength(1);
		expect(imgs[0].alt).toBe('Summer Picnic');
		expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
	});

	it('piles at most two of the set’s other photographs under the first', () => {
		const container = renderStack([photo(1), photo(2), photo(3), photo(4)]);
		const imgs = prints(container);
		expect(imgs.map((img) => new URL(img.src).pathname)).toEqual([
			'/photos/3.webp',
			'/photos/2.webp',
			// Last in the DOM, so painted on top.
			'/photos/1.webp'
		]);
		expect(imgs.map((img) => img.alt)).toEqual(['', '', 'Summer Picnic']);
		const hidden = container.querySelectorAll('[aria-hidden="true"] img');
		expect(hidden).toHaveLength(2);
	});

	it('sizes each print to its own photograph, inside the card on both axes', () => {
		// One landscape and one tall portrait: each must keep its own shape and fit.
		const container = renderStack([photo(1, 1200, 800), photo(2, 600, 1800)]);
		const box = container.getBoundingClientRect();
		for (const img of prints(container)) {
			// offsetWidth/Height, not the bounding rect: they ignore the turn and
			// scale the prints underneath wear, so this is the print's own box.
			const print = img.parentElement!;
			const natural = Number(print.style.getPropertyValue('--photo-ratio'));
			expect(print.offsetWidth / print.offsetHeight).toBeCloseTo(natural, 1);
			expect(print.offsetWidth).toBeLessThanOrEqual(box.width);
			expect(print.offsetHeight).toBeLessThanOrEqual(box.height);
		}
	});
});
