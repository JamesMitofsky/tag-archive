import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Drawing from './Drawing.svelte';

/** A 1×1 PNG: an image that loads, without depending on what `static/` holds. */
const PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * A drawing that won't load. Bytes that aren't an image fail just as a missing
 * file does (an `error` event, no pixels), without asking the test server for a
 * path it has no answer for.
 */
const BROKEN = 'data:image/webp;base64,AAAA';

/** The one image the test rendered, whichever element stands for it. */
function drawing(): HTMLElement {
	return page.getByRole('img', { name: 'Images' }).element() as HTMLElement;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Drawing.svelte', () => {
	it('shows the drawing, and no stand-in, when the file loads', async () => {
		const { container } = render(Drawing, {
			src: PNG,
			alt: 'Images',
			text: 'Images',
			class: 'h-10 w-auto'
		});

		await expect.poll(() => drawing().classList.contains('loaded')).toBe(true);
		expect(drawing().tagName).toBe('IMG');
		expect(container.textContent).not.toContain('Images');
	});

	it('sets its words in place of a missing drawing, under the same name and size', async () => {
		render(Drawing, {
			src: BROKEN,
			alt: 'Images',
			text: 'Images',
			class: 'h-10 w-auto',
			textClass: 'text-xl'
		});

		const standIn = page.getByRole('img', { name: 'Images' });
		await expect.element(standIn).toHaveTextContent('Images');
		await expect.element(standIn).toBeVisible();
		expect(drawing().tagName).toBe('SPAN');
		// The drawing's sizing carries over, and the stand-in's own classes apply on
		// top. (No stylesheet is loaded here, so the classes are what can be checked.)
		await expect.element(standIn).toHaveClass('h-10', 'w-auto', 'text-xl');
		// Not the drawing's fade, which waits for a load that will never come.
		expect(getComputedStyle(drawing()).opacity).toBe('1');
	});

	it('names the stand-in by `alt`, not by its words, as the drawing was named', async () => {
		render(Drawing, {
			src: BROKEN,
			alt: 'Cloud Keeper — add to the archive',
			text: 'Cloud Keeper'
		});

		const standIn = page.getByRole('img', { name: 'Cloud Keeper — add to the archive' });
		await expect.element(standIn).toHaveTextContent('Cloud Keeper');
		await expect
			.element(standIn)
			.toHaveAttribute('aria-label', 'Cloud Keeper — add to the archive');
	});

	it('keeps a decorative stand-in out of the accessibility tree, like the drawing', async () => {
		render(Drawing, { src: BROKEN, alt: '', 'aria-hidden': 'true', text: 'Images' });

		const standIn = page.getByText('Images');
		await expect.element(standIn).toBeVisible();
		await expect.element(standIn).toHaveAttribute('aria-hidden', 'true');
		expect(standIn.element().getAttribute('role')).toBeNull();
	});

	it('stays invisible without words to stand in, as before', async () => {
		const { container } = render(Drawing, { src: BROKEN, alt: 'Images' });
		const img = container.querySelector('img')!;

		// Let the request fail first.
		await expect.poll(() => img.complete).toBe(true);
		expect(container.querySelector('img')).toBe(img);
		expect(getComputedStyle(img).opacity).toBe('0');
	});

	it('gives a new src its own attempt rather than the old failure', async () => {
		const { rerender } = render(Drawing, { src: BROKEN, alt: 'Images', text: 'Images' });
		await expect.poll(() => drawing().tagName).toBe('SPAN');

		await rerender({ src: PNG });

		await expect.poll(() => drawing().tagName).toBe('IMG');
		await expect.poll(() => drawing().classList.contains('loaded')).toBe(true);
	});

	describe('an image already settled at mount (server-rendered, settled before hydration)', () => {
		/** Make every <img> report it finished with no pixels before the component saw it. */
		function settledWithoutPixels(decode: () => Promise<void>) {
			vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
			vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0);
			vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(decode);
		}

		it('falls back when the load had already failed, an error event it never heard', async () => {
			settledWithoutPixels(() => Promise.reject(new DOMException('broken', 'EncodingError')));
			// The file itself is fine and fires no error: only the mount check can know.
			render(Drawing, { src: PNG, alt: 'Images', text: 'Images' });

			await expect.poll(() => drawing().tagName).toBe('SPAN');
			await expect.element(page.getByRole('img', { name: 'Images' })).toHaveTextContent('Images');
		});

		it('keeps an image with no intrinsic size, such as a viewBox-only SVG, that decodes', async () => {
			settledWithoutPixels(() => Promise.resolve());
			render(Drawing, { src: PNG, alt: 'Images', text: 'Images' });

			await expect.poll(() => drawing().classList.contains('cached')).toBe(true);
			expect(drawing().tagName).toBe('IMG');
		});
	});

	// Chromium gives such an SVG the default 300×150, so it never reaches the
	// decode() check; engines that report 0, as the spec says, do (covered above).
	it('shows a real viewBox-only SVG, not its stand-in', async () => {
		const svg =
			'data:image/svg+xml,' +
			encodeURIComponent(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 2"><path d="M0 1h4" stroke="#000"/></svg>'
			);
		render(Drawing, { src: svg, alt: 'Images', text: 'Images', class: 'h-10 w-auto' });

		await expect.poll(() => drawing().classList.contains('loaded')).toBe(true);
		expect(drawing().tagName).toBe('IMG');
	});
});
