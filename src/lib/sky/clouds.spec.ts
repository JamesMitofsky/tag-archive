import { describe, expect, it } from 'vitest';
import {
	CLOUD_SMALLEST,
	CLOUDS,
	cloudScale,
	DRIFT_FROM,
	DRIFT_SPAN,
	nearness,
	phaseTime,
	placeCloud,
	restingPhase,
	steerCloud,
	VERTICAL_MARGIN,
	type Cloud,
	type SkyBox,
	type Steering
} from './clouds';

const BOXES: SkyBox[] = [
	{ width: 1920, height: 1080 },
	{ width: 1080, height: 1920 },
	{ width: 3840, height: 1600 }
];
const ASPECT = 1045 / 1400;
const still = { dx: 0, dy: 0, zoom: 1, dt: 0, parallax: 0.3 };

/** The progress a CSS animation with the cloud's timing shows at `time` (s). */
const cssProgress = (cloud: Cloud, time: number) =>
	((((time - cloud.delay) / cloud.dur) % 1) + 1) % 1;

/** The cloud's drawn box on screen (px). */
function drawn(cloud: Cloud, steering: Steering, zoom: number, parallax: number, box: SkyBox) {
	const { x, y, scale } = placeCloud(cloud, steering, zoom, parallax, box, ASPECT);
	const w = (cloud.w / 100) * box.width;
	const h = w * ASPECT;
	const cx = x + w / 2;
	const cy = (cloud.top / 100) * box.height + y + h / 2;
	return {
		left: cx - (w * scale) / 2,
		right: cx + (w * scale) / 2,
		top: cy - (h * scale) / 2,
		bottom: cy + (h * scale) / 2
	};
}

const offScreen = (b: ReturnType<typeof drawn>, box: SkyBox) =>
	b.right <= 0 || b.left >= box.width || b.bottom <= 0 || b.top >= box.height;

describe('the drift handoff', () => {
	it('places an unmoved cloud exactly where its CSS animation has it', () => {
		const box = BOXES[0];
		for (const cloud of CLOUDS) {
			for (const phase of [0, 0.25, 0.6, 0.99]) {
				const { x, y, scale } = placeCloud(cloud, { phase, rise: 0 }, 1, 0.3, box, ASPECT);
				expect(x).toBeCloseTo(((DRIFT_FROM + phase * DRIFT_SPAN) / 100) * box.width, 6);
				expect(y).toBeCloseTo(0, 6);
				expect(scale).toBe(1);
			}
		}
	});

	it('seeks an animation back to the phase its cloud was let go at', () => {
		for (const cloud of CLOUDS) {
			for (const phase of [0, 0.1, 0.5, 0.97]) {
				const time = phaseTime(cloud, phase);
				// Never before the delay, or the animation would not be under way.
				expect(time).toBeGreaterThanOrEqual(cloud.delay);
				expect(cssProgress(cloud, time)).toBeCloseTo(phase, 9);
			}
		}
	});

	it('starts each cloud where its animation stands before anything seeks it', () => {
		for (const cloud of CLOUDS) {
			expect(restingPhase(cloud)).toBeCloseTo(cssProgress(cloud, 0), 9);
		}
	});
});

describe('steerCloud', () => {
	it('drifts on at the pace of the CSS animation', () => {
		const box = BOXES[0];
		for (const cloud of CLOUDS) {
			const steering = { phase: 0.2, rise: 0 };
			steerCloud(cloud, steering, { ...still, dt: cloud.dur / 10 }, box, ASPECT);
			expect(steering.phase).toBeCloseTo(0.3, 9);
		}
	});

	it('moves each cloud with the view by its share, the nearest the most', () => {
		const box = BOXES[0];
		const moved = CLOUDS.map((cloud) => {
			const steering = { phase: 0.4, rise: 0 };
			const before = placeCloud(cloud, steering, 1, 0.3, box, ASPECT);
			steerCloud(cloud, steering, { ...still, dx: 100, dy: 40 }, box, ASPECT);
			const after = placeCloud(cloud, steering, 1, 0.3, box, ASPECT);
			expect(after.x - before.x).toBeCloseTo(100 * 0.3 * nearness(cloud), 6);
			expect(after.y - before.y).toBeCloseTo(40 * 0.3 * nearness(cloud), 6);
			return { w: cloud.w, dx: after.x - before.x };
		});
		const nearest = moved.reduce((a, b) => (b.w > a.w ? b : a));
		const farthest = moved.reduce((a, b) => (b.w < a.w ? b : a));
		expect(nearest.dx).toBeGreaterThan(farthest.dx);
	});

	it('keeps a cloud on its track however far the view goes', () => {
		const box = BOXES[0];
		const cloud = CLOUDS[1];
		const steering = { phase: 0.5, rise: 0 };
		for (let i = 0; i < 10000; i++) {
			steerCloud(cloud, steering, { ...still, dx: -373, dy: 911 }, box, ASPECT);
		}
		expect(steering.phase).toBeGreaterThanOrEqual(0);
		expect(steering.phase).toBeLessThan(1);
		expect(steering.rise).toBeGreaterThanOrEqual(0);
		expect(steering.rise).toBeLessThan(1);
	});
});

describe('cloudScale', () => {
	it('is 1 at rest and follows the zoom by its share', () => {
		expect(cloudScale(1, 0.3)).toBe(1);
		expect(cloudScale(2, 0.3)).toBeCloseTo(2 ** 0.3, 9);
		// Zooming out a little, as near as makes no difference to the same.
		expect(cloudScale(0.95, 0.3)).toBeCloseTo(0.95 ** 0.3, 3);
		expect(cloudScale(3, 0)).toBe(1);
	});

	it('never shrinks a cloud past CLOUD_SMALLEST, and never stops shrinking it short of that', () => {
		let last = Infinity;
		// Down to a zoom far past any the field allows; much farther and the
		// difference from CLOUD_SMALLEST is below a double's precision.
		for (let zoom = 1; zoom > 0.02; zoom *= 0.8) {
			const scale = cloudScale(zoom, 1);
			expect(scale).toBeGreaterThanOrEqual(CLOUD_SMALLEST);
			expect(scale).toBeLessThan(last);
			last = scale;
		}
	});
});

describe('the wrap', () => {
	const zooms = [0.001, 0.16, 0.5, 1, 2.4, 10];
	const parallaxes = [0, 0.3, 1];

	it('happens off screen across the track, at any zoom', () => {
		for (const box of BOXES)
			for (const cloud of CLOUDS)
				for (const zoom of zooms)
					for (const parallax of parallaxes)
						for (const phase of [0, 0.999999]) {
							expect(offScreen(drawn(cloud, { phase, rise: 0 }, zoom, parallax, box), box)).toBe(
								true
							);
						}
	});

	it('happens off screen past the top and bottom, at any zoom', () => {
		for (const box of BOXES)
			for (const cloud of CLOUDS)
				for (const zoom of zooms)
					for (const parallax of parallaxes) {
						// The rise at which the cloud wraps from the bottom edge back to the top.
						const h = (cloud.w / 100) * box.width * ASPECT;
						const margin = box.height * VERTICAL_MARGIN;
						const span = box.height + h + 2 * margin;
						const wrapAt = 1 - ((cloud.top / 100) * box.height + h + margin) / span;
						for (const rise of [wrapAt, wrapAt - 1e-9]) {
							const b = drawn(cloud, { phase: 0.5, rise }, zoom, parallax, box);
							expect(offScreen(b, box)).toBe(true);
						}
					}
	});
});
