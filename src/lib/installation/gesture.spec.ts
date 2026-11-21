import { describe, expect, it } from 'vitest';
import { createGesture, MIN_SPREAD, type GestureSink } from './gesture';

/** A gesture whose sink records what it was told. */
function recorder() {
	const log = { downs: 0, dx: 0, dy: 0, zoom: 1, ups: [] as { vx: number; vy: number }[] };
	const sink: GestureSink = {
		down: () => log.downs++,
		drag: (dx, dy) => {
			log.dx += dx;
			log.dy += dy;
		},
		pinch: (factor) => (log.zoom *= factor),
		up: (vx, vy) => log.ups.push({ vx, vy })
	};
	return { log, gesture: createGesture(sink) };
}

describe('createGesture', () => {
	it('drags with one finger and flings on release', () => {
		const { log, gesture } = recorder();
		gesture.pointerDown(1, 0, 0, 0);
		for (let i = 1; i <= 10; i++) gesture.pointerMove(1, [{ t: i * 10, x: i * 10, y: 0 }]);
		gesture.pointerUp(1, 100);
		expect(log.downs).toBe(1);
		expect(log.dx).toBeCloseTo(100);
		expect(log.zoom).toBe(1);
		expect(log.ups).toHaveLength(1);
		expect(log.ups[0].vx).toBeCloseTo(1000, -1);
	});

	it('pinches by the change in two fingers’ spread, and pans by their midpoint', () => {
		const { log, gesture } = recorder();
		gesture.pointerDown(1, 100, 100, 0);
		gesture.pointerDown(2, 200, 100, 10);
		// Spread from 100 to 200 px, about a midpoint that stays put.
		gesture.pointerMove(1, [{ t: 20, x: 50, y: 100 }]);
		gesture.pointerMove(2, [{ t: 30, x: 250, y: 100 }]);
		expect(log.zoom).toBeCloseTo(2);
		expect(log.dx).toBeCloseTo(0);
		// Both move down together: a pan, no zoom.
		gesture.pointerMove(1, [{ t: 40, x: 50, y: 140 }]);
		gesture.pointerMove(2, [{ t: 50, x: 250, y: 140 }]);
		expect(log.zoom).toBeCloseTo(2);
		expect(log.dy).toBeCloseTo(40);
		expect(log.downs).toBe(1);
	});

	it('reads neither a finger landing nor lifting as travel', () => {
		const { log, gesture } = recorder();
		gesture.pointerDown(1, 0, 0, 0);
		gesture.pointerDown(2, 400, 0, 10);
		gesture.pointerUp(1, 20);
		gesture.pointerMove(2, [{ t: 30, x: 410, y: 0 }]);
		expect(log.dx).toBeCloseTo(10);
		expect(log.ups).toHaveLength(0);
	});

	it('does not fling when the fingers of a pinch lift one after the other', () => {
		const { log, gesture } = recorder();
		gesture.pointerDown(1, 0, 0, 0);
		gesture.pointerDown(2, 100, 0, 0);
		for (let i = 1; i <= 10; i++) {
			gesture.pointerMove(1, [{ t: i * 10, x: -i * 10, y: i * 10 }]);
			gesture.pointerMove(2, [{ t: i * 10, x: 100 + i * 10, y: i * 10 }]);
		}
		gesture.pointerUp(1, 105);
		gesture.pointerUp(2, 110);
		expect(log.ups).toEqual([{ vx: 0, vy: 0 }]);
	});

	it('ignores a third finger', () => {
		const { log, gesture } = recorder();
		gesture.pointerDown(1, 0, 0, 0);
		gesture.pointerDown(2, 100, 0, 0);
		expect(gesture.pointerDown(3, 50, 50, 0)).toBe(false);
		expect(gesture.pointerMove(3, [{ t: 10, x: 500, y: 500 }])).toBe(false);
		expect(gesture.pointerUp(3, 20)).toBe(false);
		expect(gesture.count).toBe(2);
		expect(log.dx).toBe(0);
		expect(log.zoom).toBe(1);
	});

	it('cannot make fingers that nearly touch read as a huge zoom', () => {
		const { log, gesture } = recorder();
		gesture.pointerDown(1, 0, 0, 0);
		gesture.pointerDown(2, 1, 0, 0);
		gesture.pointerMove(2, [{ t: 10, x: MIN_SPREAD * 2, y: 0 }]);
		expect(log.zoom).toBeCloseTo(2);
	});

	it('gives no velocity to a cancelled touch', () => {
		const { log, gesture } = recorder();
		gesture.pointerDown(1, 0, 0, 0);
		for (let i = 1; i <= 10; i++) gesture.pointerMove(1, [{ t: i * 10, x: i * 10, y: 0 }]);
		gesture.pointerUp(1, 100, true);
		expect(log.ups).toEqual([{ vx: 0, vy: 0 }]);
	});
});
