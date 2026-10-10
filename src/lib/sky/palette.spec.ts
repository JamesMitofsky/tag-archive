import { describe, expect, it } from 'vitest';
import { contrast, hexToLab, luminance } from './color';
import { DC, skyFrame } from './engine';
import { SKY_PALETTE } from './palette';

const INK = luminance(hexToLab('#14120f'));

describe('the generated sky palette', () => {
	it('keeps every keyframe legible against the ink (WCAG AA, 4.5:1)', () => {
		for (const lab of SKY_PALETTE.colours) {
			expect(contrast(luminance(lab), INK)).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('stays legible in between keyframes too, every 10 minutes of a whole year', () => {
		// Interpolating between two legible colours can, in principle, dip below
		// the floor when their hues differ; sample what is actually rendered.
		let worst = Infinity;
		const start = Date.parse('2026-01-01T00:00:00Z');
		for (let t = start; t < start + 365 * 86400000; t += 10 * 60000) {
			// Every colour the glow is drawn through; the screen between them
			// blends from one to the next.
			for (const hex of skyFrame(t, SKY_PALETTE, DC.lat, DC.lon).glowHex) {
				worst = Math.min(worst, contrast(luminance(hexToLab(hex)), INK));
			}
		}
		expect(worst).toBeGreaterThanOrEqual(4.5);
	});

	it('is well-formed', () => {
		const { elevations, colours, clouds, stars, glow } = SKY_PALETTE;
		expect(elevations).toEqual([...elevations].sort((a, b) => a - b));
		expect(colours).toHaveLength(elevations.length);
		expect(clouds).toHaveLength(elevations.length);
		expect(stars).toHaveLength(elevations.length);
		expect(glow.stops).toBeGreaterThanOrEqual(2);
		expect(elevations[0]).toBeLessThanOrEqual(-90);
		expect(elevations.at(-1)).toBeGreaterThanOrEqual(90);
	});

	it('brings the stars out through twilight, all of them by full night', () => {
		const starsAt = (e: number) => SKY_PALETTE.stars[SKY_PALETTE.elevations.indexOf(e)];
		expect(starsAt(-4)).toBe(0);
		expect(starsAt(-12)).toBe(0.7);
		expect(starsAt(-18)).toBe(1);
	});
});
