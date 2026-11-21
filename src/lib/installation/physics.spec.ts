import { describe, expect, it } from 'vitest';
import {
	createSim,
	decay,
	releaseVelocity,
	springStep,
	TUNING,
	type FindAnchor,
	type Sample
} from './physics';

const nothing: FindAnchor = () => null;

/** Step the sim at 60 fps for `seconds`, starting at time `from`. */
function run(sim: ReturnType<typeof createSim>, from: number, seconds: number, find = nothing) {
	const dt = 1 / 60;
	let t = from;
	for (let i = 0; i < Math.round(seconds / dt); i++) {
		t += dt;
		sim.step(dt, t, find);
	}
	return t;
}

describe('decay', () => {
	it('halves over one half-life', () => {
		expect(decay(0.6, 0.6)).toBeCloseTo(0.5);
		expect(decay(0.6, 1.2)).toBeCloseTo(0.25);
	});
});

describe('springStep', () => {
	it('settles on the target without overshooting from rest', () => {
		let pos = 0;
		let vel = 0;
		let max = 0;
		for (let i = 0; i < 120; i++) {
			[pos, vel] = springStep(pos, vel, 100, 18, 1 / 60);
			max = Math.max(max, pos);
		}
		expect(pos).toBeCloseTo(100, 3);
		expect(max).toBeLessThanOrEqual(100 + 1e-9);
	});

	it('gives the same result in one step as in many', () => {
		const [once] = springStep(0, 0, 50, 10, 0.2);
		let pos = 0;
		let vel = 0;
		for (let i = 0; i < 20; i++) [pos, vel] = springStep(pos, vel, 50, 10, 0.01);
		expect(once).toBeCloseTo(pos, 6);
	});
});

describe('releaseVelocity', () => {
	const steady = (vx: number, until = 100): Sample[] =>
		Array.from({ length: 11 }, (_, i) => ({
			t: until - 100 + i * 10,
			x: (vx * (i * 10)) / 1000,
			y: 0
		}));

	it('reads a steady swipe exactly', () => {
		const v = releaseVelocity(steady(800), 100);
		expect(v.x).toBeCloseTo(800);
		expect(v.y).toBeCloseTo(0);
	});

	it('is not swung by one jittery sample', () => {
		const samples = steady(800);
		samples[8] = { ...samples[8], x: samples[8].x + 6 };
		expect(releaseVelocity(samples, 100).x).toBeGreaterThan(650);
		expect(releaseVelocity(samples, 100).x).toBeLessThan(950);
	});

	it('is zero when the finger stopped before lifting', () => {
		expect(releaseVelocity(steady(800), 300)).toEqual({ x: 0, y: 0 });
	});

	it('is zero with too few samples', () => {
		expect(releaseVelocity([{ t: 0, x: 0, y: 0 }], 0)).toEqual({ x: 0, y: 0 });
		expect(releaseVelocity([], 0)).toEqual({ x: 0, y: 0 });
	});
});

describe('createSim', () => {
	it('moves the field with the finger, so the camera moves against it', () => {
		const sim = createSim({ x: 0, y: 0 });
		sim.down(0);
		sim.drag(10, -4, 0);
		run(sim, 0, 1);
		expect(sim.cam.x).toBeCloseTo(-10 * TUNING.gain, 1);
		expect(sim.cam.y).toBeCloseTo(4 * TUNING.gain, 1);
	});

	it('follows bunched drags smoothly rather than jumping', () => {
		const sim = createSim({ x: 0, y: 0 });
		sim.down(0);
		// Three frames' worth of finger travel arriving in one packet.
		sim.drag(30, 0, 0);
		sim.step(1 / 60, 1 / 60, nothing);
		expect(Math.abs(sim.cam.x)).toBeLessThan(30 * TUNING.gain * 0.25);
	});

	it('glides on after release and slows to rest', () => {
		const sim = createSim({ x: 0, y: 0 });
		sim.down(0);
		sim.up(1000, 0, 0);
		const t = run(sim, 0, 0.5);
		const midway = sim.cam.x;
		expect(midway).toBeLessThan(-200);
		run(sim, t, 6);
		expect(sim.speed).toBeLessThan(1);
		// It travelled no further than the friction allows: v0 · halfLife / ln 2.
		const most = (1000 * TUNING.gain * TUNING.glideHalfLife) / Math.LN2;
		expect(Math.abs(sim.cam.x)).toBeLessThan(most * 1.05);
	});

	it('clamps a wild fling to the top speed', () => {
		const sim = createSim({ x: 0, y: 0 });
		sim.up(1e6, 0, 0);
		sim.step(1 / 60, 1 / 60, nothing);
		run(sim, 1 / 60, 0.3);
		expect(sim.speed).toBeLessThanOrEqual(TUNING.maxSpeed * 1.01);
	});

	it('lets the magnet draw the nearest item into the lens without overshoot', () => {
		const sim = createSim({ x: 0, y: 0 });
		const anchor = { x: 60, y: -40 };
		const find: FindAnchor = () => anchor;
		// Released slowly: the magnet takes over at once.
		sim.up(-10, 0, 0);
		let t = 0;
		let worst = 0;
		for (let i = 0; i < 180; i++) {
			t += 1 / 60;
			sim.step(1 / 60, t, find);
			worst = Math.max(worst, sim.cam.x);
		}
		expect(sim.mode).toBe('magnet');
		expect(sim.cam.x).toBeCloseTo(anchor.x, 0);
		expect(sim.cam.y).toBeCloseTo(anchor.y, 0);
		expect(worst).toBeLessThan(anchor.x + 3);
	});

	it('holds one anchor while settling, even if another becomes nearer', () => {
		const sim = createSim({ x: 0, y: 0 });
		let calls = 0;
		sim.up(0, 0, 0);
		run(sim, 0, 2, () => {
			calls++;
			return { x: 50, y: 0 };
		});
		expect(calls).toBe(1);
	});

	it('starts the current after a while alone, and a touch stops it', () => {
		const sim = createSim({ x: 0, y: 0 });
		sim.up(0, 0, 0);
		const t = run(sim, 0, TUNING.idleAfter + 15);
		expect(sim.mode).toBe('current');
		expect(sim.speed).toBeGreaterThan(TUNING.currentSpeed * 0.9);
		sim.down(t);
		expect(sim.mode).toBe('touch');
	});

	it('starts in the current with the lens at rest, since nobody has steered yet', () => {
		const sim = createSim({ x: 0, y: 0 });
		run(sim, 0, 1, () => ({ x: 40, y: 0 }));
		expect(sim.mode).toBe('current');
		expect(sim.lens).toBe(0);
	});

	it('wakes the lens at a touch and keeps it awake until a minute alone', () => {
		const sim = createSim({ x: 0, y: 0 });
		run(sim, 0, 1);
		sim.down(1);
		let t = run(sim, 1, 0.5);
		expect(sim.lens).toBeGreaterThan(0.8);
		t = run(sim, t, 2);
		expect(sim.lens).toBe(1);
		sim.up(0, 0, t);
		t = run(sim, t, TUNING.idleAfter - 1);
		expect(sim.mode).not.toBe('current');
		expect(sim.lens).toBe(1);
		t = run(sim, t, 2);
		expect(sim.mode).toBe('current');
		// It rests gradually rather than snapping off.
		expect(sim.lens).toBeGreaterThan(0);
		expect(sim.lens).toBeLessThan(1);
		run(sim, t, 15);
		expect(sim.lens).toBe(0);
	});

	it('takes a drag without a down as a touch', () => {
		const sim = createSim({ x: 0, y: 0 });
		sim.drag(1, 0, 0);
		expect(sim.mode).toBe('touch');
	});

	it('does not fling the field after a long frame', () => {
		const sim = createSim({ x: 0, y: 0 });
		sim.down(0);
		sim.drag(100, 0, 0);
		sim.step(5, 5, nothing);
		expect(Math.abs(sim.cam.x)).toBeLessThan(100 * TUNING.gain);
	});

	it('keeps the view when shifted by a world size', () => {
		const sim = createSim({ x: 10, y: 20 });
		sim.shift(-1000, 500);
		expect(sim.cam).toEqual({ x: -990, y: 520 });
	});
});

describe('createSim zoom', () => {
	it('zooms by the pinch raised to its gain, and the shown scale follows', () => {
		const sim = createSim({ x: 0, y: 0 });
		expect(sim.scale).toBe(1);
		sim.down(0);
		sim.pinch(0.5, 0, 1);
		expect(sim.zooming).toBe(true);
		run(sim, 0, 1);
		expect(sim.scale).toBeCloseTo(0.5, 3);
		expect(sim.zooming).toBe(false);
		sim.pinch(2, 1);
		run(sim, 1, 1);
		expect(sim.scale).toBeCloseTo(0.5 * Math.pow(2, TUNING.zoomGain), 3);
	});

	it('follows the pinch smoothly rather than jumping', () => {
		const sim = createSim({ x: 0, y: 0 });
		sim.pinch(2, 0, 1);
		sim.step(1 / 60, 1 / 60, nothing);
		expect(sim.scale).toBeGreaterThan(1);
		expect(sim.scale).toBeLessThan(1.1);
	});

	it('stays within its range, which the page may narrow', () => {
		const sim = createSim({ x: 0, y: 0 });
		sim.pinch(1000, 0, 1);
		run(sim, 0, 1);
		expect(sim.scale).toBeCloseTo(TUNING.maxZoom, 3);
		sim.setZoomRange(0.5, 1.5);
		run(sim, 1, 1);
		expect(sim.scale).toBeCloseTo(1.5, 3);
		sim.pinch(0.001, 2, 1);
		run(sim, 2, 1);
		expect(sim.scale).toBeCloseTo(0.5, 3);
	});

	it('moves the field by the finger’s travel on screen, whatever the zoom', () => {
		const sim = createSim({ x: 0, y: 0 });
		sim.pinch(0.25, 0, 1);
		run(sim, 0, 1);
		sim.drag(10, 0, 1, 1);
		run(sim, 1, 0.5);
		// 10 screen px is 40 world px at a quarter of the size.
		expect(sim.cam.x).toBeCloseTo(-40, 0);
	});

	it('measures speed on screen', () => {
		const sim = createSim({ x: 0, y: 0 });
		sim.pinch(0.5, 0, 1);
		run(sim, 0, 1);
		sim.up(-400, 0, 1, 1);
		run(sim, 1, 0.3);
		// Gliding at about 400 screen px/s, decayed a little; 800 world px/s.
		expect(sim.speed).toBeGreaterThan(200);
		expect(sim.speed).toBeLessThan(400);
	});

	it('wakes a resting field without holding it as a touch', () => {
		const sim = createSim({ x: 0, y: 0 });
		expect(sim.mode).toBe('current');
		sim.pinch(1.2, 0, 1);
		run(sim, 0, 3);
		expect(sim.mode).not.toBe('current');
		expect(sim.mode).not.toBe('touch');
		expect(sim.lens).toBeGreaterThan(0.9);
	});

	it('ignores a pinch that is not a number', () => {
		const sim = createSim({ x: 0, y: 0 });
		sim.pinch(Number.NaN, 0, 1);
		sim.pinch(0, 0, 1);
		sim.pinch(Infinity, 0, 1);
		run(sim, 0, 1);
		expect(sim.scale).toBe(1);
	});
});
