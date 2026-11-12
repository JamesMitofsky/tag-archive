import { describe, expect, it } from 'vitest';
import { CDN_WIDTHS, cdnWidth } from './cdnWidths';

describe('cdnWidth', () => {
	it('keeps a width the optimizer allows', () => {
		for (const width of CDN_WIDTHS) expect(cdnWidth(width)).toBe(width);
	});

	it('rounds a width up to the next allowed one, so an image is never served too small', () => {
		expect(cdnWidth(1)).toBe(64);
		expect(cdnWidth(65)).toBe(80);
		expect(cdnWidth(400)).toBe(480);
	});

	it('caps a width past the largest allowed one', () => {
		expect(cdnWidth(4000)).toBe(1920);
	});

	it('lists widths in ascending order, which the snapping relies on', () => {
		expect([...CDN_WIDTHS]).toEqual([...CDN_WIDTHS].sort((a, b) => a - b));
	});
});
