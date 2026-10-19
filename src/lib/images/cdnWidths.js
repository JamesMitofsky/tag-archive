/**
 * The widths Vercel's image optimizer (`/_vercel/image`) will render. It
 * refuses any `w` that is not in the list the build declared, so this one list
 * feeds both sides: svelte.config.js hands it to the adapter, and
 * OptimizedImage snaps every width it asks for onto it (see `cdnWidth`).
 *
 * Plain JS, not TS, because svelte.config.js imports it before any TypeScript
 * tooling runs.
 *
 * Each width is a separate transformation, and the Hobby plan includes 5,000 a
 * month, so keep the list short: the srcset widths OptimizedImage uses by
 * default, plus the small ones the keeper thumbnail grids ask for.
 */
export const CDN_WIDTHS = Object.freeze([
	64, 80, 128, 160, 192, 240, 320, 480, 640, 960, 1280, 1920
]);

/**
 * The smallest allowed width that is at least `width`, so an image is never
 * served smaller than asked; the largest allowed width past the end.
 *
 * @param {number} width
 * @returns {number}
 */
export function cdnWidth(width) {
	return CDN_WIDTHS.find((allowed) => allowed >= width) ?? CDN_WIDTHS[CDN_WIDTHS.length - 1];
}
