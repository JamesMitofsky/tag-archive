import { describe, expect, it } from 'vitest';
import { DC, frameDistance, skyFrame } from './engine';
import { SKY_PALETTE } from './palette';

const frameAt = (iso: string) => skyFrame(Date.parse(iso), SKY_PALETTE, DC.lat, DC.lon);
const elevationAt = (ms: number) => skyFrame(ms, SKY_PALETTE, DC.lat, DC.lon).elevation;

/** Every moment on `day` (local DC time) the sun crosses the sunrise/sunset altitude. */
function horizonCrossings(dayStartIso: string): Date[] {
	const start = Date.parse(dayStartIso);
	const crossings: Date[] = [];
	for (let s = 0; s < 86400; s += 10) {
		const a = elevationAt(start + s * 1000) < -0.833;
		const b = elevationAt(start + (s + 10) * 1000) < -0.833;
		if (a !== b) crossings.push(new Date(start + s * 1000));
	}
	return crossings;
}

const minutesApart = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60000;

describe('solar elevation over DC', () => {
	it('peaks where the geometry says it must on the solstices and equinox', () => {
		// Solar noon elevation = 90° − latitude + declination.
		const peak = (day: string) => {
			let max = -90;
			for (let m = 0; m < 24 * 60; m += 1) {
				max = Math.max(max, elevationAt(Date.parse(`${day}T04:00:00Z`) + m * 60000));
			}
			return max;
		};
		expect(peak('2026-06-21')).toBeCloseTo(90 - DC.lat + 23.44, 0);
		expect(peak('2026-12-21')).toBeCloseTo(90 - DC.lat - 23.44, 0);
		expect(peak('2026-03-20')).toBeCloseTo(90 - DC.lat, 0);
	});

	it('sets at the published times (within 2 minutes)', () => {
		// DC's latest sunset of 2026 is 8:37 PM EDT, around the June solstice;
		// the December solstice sunset is 4:49 PM EST.
		const [, june] = horizonCrossings('2026-06-21T00:00:00-04:00');
		expect(minutesApart(june, new Date('2026-06-21T20:37:00-04:00'))).toBeLessThan(2);
		const [, december] = horizonCrossings('2026-12-21T00:00:00-05:00');
		expect(minutesApart(december, new Date('2026-12-21T16:49:00-05:00'))).toBeLessThan(2);
	});

	it('ignores the viewer’s timezone and daylight saving — only the instant matters', () => {
		const a = frameAt('2026-11-01T01:30:00-04:00'); // EDT, before the clocks go back
		const b = frameAt('2026-11-01T05:30:00Z'); // the same instant, written in UTC
		expect(a.hex).toEqual(b.hex);
	});
});

describe('sky colour', () => {
	it('is the site’s brand blue at midday', () => {
		expect(frameAt('2026-06-21T13:00:00-04:00').hex[0]).toBe('#94cae7');
	});

	it('warms the horizon at sunset and settles into the night palette after dark', () => {
		const sunset = frameAt('2026-06-21T20:37:00-04:00');
		const night = frameAt('2026-06-22T01:00:00-04:00');
		const [r, , b] = [1, 3, 5].map((i) => parseInt(sunset.hex[2].slice(i, i + 2), 16));
		expect(r).toBeGreaterThan(b); // warm, not blue
		expect(night.hex).toEqual(frameAt('2026-12-22T01:00:00-05:00').hex);
		expect(night.clouds).toBeLessThan(1);
	});

	it('changes continuously — no jumps between keyframes', () => {
		// Across a full day, a minute never moves the colour more than a fraction
		// of a just-noticeable difference.
		const start = Date.parse('2026-03-20T00:00:00-04:00');
		let previous = skyFrame(start, SKY_PALETTE, DC.lat, DC.lon);
		for (let m = 1; m <= 24 * 60; m++) {
			const next = skyFrame(start + m * 60000, SKY_PALETTE, DC.lat, DC.lon);
			expect(frameDistance(previous, next)).toBeLessThan(0.02);
			previous = next;
		}
	});
});
