import { describe, expect, it } from 'vitest';
import { DC, colourAt, frameDistance, skyFrame, type Lab } from './engine';
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

describe('the sun’s place on the screen', () => {
	const sunAt = (iso: string) => frameAt(iso).sun;

	it('rises in the bottom-right, arcs up through the middle, and sets in the bottom-left', () => {
		const rise = sunAt('2026-03-20T07:10:00-04:00');
		const noon = sunAt('2026-03-20T13:15:00-04:00');
		const set = sunAt('2026-03-20T19:20:00-04:00');
		expect(rise.x).toBeGreaterThan(0.9);
		expect(rise.y).toBeCloseTo(1, 1);
		expect(noon.x).toBeCloseTo(0.5, 1);
		expect(noon.y).toBeCloseTo(1 - (90 - DC.lat) / 90, 1);
		expect(set.x).toBeLessThan(0.1);
		expect(set.y).toBeCloseTo(1, 1);
	});

	it('sinks below the frame after sunset', () => {
		expect(sunAt('2026-03-20T20:00:00-04:00').y).toBeGreaterThan(1);
	});

	it('reaches from the sun to the screen’s farthest corner', () => {
		const { x, y, reach } = sunAt('2026-03-20T09:00:00-04:00');
		const corners = [0, 1].flatMap((cx) => [0, 1].map((cy) => Math.hypot(cx - x, cy - y)));
		expect(reach).toBeCloseTo(Math.max(...corners), 6);
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

	const deltaE = (p: Lab, q: Lab) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

	it('glows round a low sun, and is one plain colour by day and by night', () => {
		// The glow runs from the sun's place out to the farthest corner.
		const spread = (iso: string) => {
			const { glow } = frameAt(iso);
			return deltaE(glow[0], glow.at(-1)!);
		};
		expect(spread('2026-06-21T20:30:00-04:00')).toBeGreaterThan(0.05); // dusk
		expect(spread('2026-06-21T13:00:00-04:00')).toBe(0); // noon
		expect(spread('2026-06-22T01:00:00-04:00')).toBe(0); // night
	});

	it('is one glow centred on the sun: alike at equal distances, not banded down the screen', () => {
		for (const iso of [
			'2026-06-21T19:30:00-04:00', // golden hour
			'2026-06-21T20:37:00-04:00', // sunset
			'2026-06-21T21:00:00-04:00' // civil twilight
		]) {
			const frame = frameAt(iso);
			const { x, y } = frame.sun;
			// Round: the same colour all the way round a circle about the sun.
			const ring = [20, 45, 70].map((deg) =>
				colourAt(
					frame,
					x + 0.4 * Math.cos((deg * Math.PI) / 180),
					y - 0.4 * Math.sin((deg * Math.PI) / 180)
				)
			);
			for (const colour of ring) expect(deltaE(colour, ring[0])).toBeLessThan(1e-9);
			// Travelling with the sun: along the bottom of the screen the sky
			// differs between the sun's side and the far side.
			expect(deltaE(colourAt(frame, x, 1), colourAt(frame, 1 - x, 1))).toBeGreaterThan(0.03);
		}
	});

	it('paints near the sun the sky with the sun higher, and far from it lower', () => {
		const frame = frameAt('2026-06-21T20:37:00-04:00');
		const { spread } = SKY_PALETTE.glow;
		// The palette's colour with the sun at `elevation`, between keyframes.
		const skyWithSunAt = (elevation: number): Lab => {
			const { elevations, colours } = SKY_PALETTE;
			const i = elevations.findLastIndex((e) => e <= elevation);
			const t = (elevation - elevations[i]) / (elevations[i + 1] - elevations[i]);
			return colours[i].map((c, k) => c + (colours[i + 1][k] - c) * t) as Lab;
		};
		expect(deltaE(frame.glow[0], skyWithSunAt(frame.elevation + spread))).toBeLessThan(1e-9);
		expect(deltaE(frame.glow.at(-1)!, skyWithSunAt(frame.elevation - spread))).toBeLessThan(1e-9);
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
