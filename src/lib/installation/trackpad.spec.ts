import { describe, expect, it } from 'vitest';
import { createTrackpad, wheelInput, type WheelInput } from './trackpad';

const FRAME = 1000 / 60;

/** Records what the trackpad told the sim. */
function recorder() {
	const calls: (['down'] | ['drag', number, number] | ['up', number, number])[] = [];
	const pad = createTrackpad({
		down: () => calls.push(['down']),
		drag: (dx, dy) => calls.push(['drag', dx, dy]),
		up: (vx, vy) => calls.push(['up', vx, vy])
	});
	const count = (kind: string) => calls.filter((c) => c[0] === kind).length;
	return { pad, calls, count };
}

/** Fingers moving steadily: `n` events a frame apart, `dx` px each. */
function steady(from: number, n: number, dx: number, dy = 0): WheelInput[] {
	return Array.from({ length: n }, (_, i) => ({ t: from + i * FRAME, dx, dy }));
}

/** macOS's momentum after a lift: deltas that lose a steady share each frame. */
function momentum(from: number, n: number, dx: number, dy = 0, keep = 0.95): WheelInput[] {
	return Array.from({ length: n }, (_, i) => ({
		t: from + i * FRAME,
		dx: dx * keep ** (i + 1),
		dy: dy * keep ** (i + 1)
	}));
}

describe('createTrackpad', () => {
	it('reads a swipe and its momentum as a drag and a lift, then ignores the momentum', () => {
		const { pad, calls, count } = recorder();
		const swipe = steady(0, 20, 10);
		const tail = momentum(20 * FRAME, 60, 10);
		for (const e of [...swipe, ...tail]) pad.feed(e);

		expect(calls[0]).toEqual(['down']);
		expect(count('down')).toBe(1);
		expect(count('up')).toBe(1);
		// Every finger event drags; only the first few frames of momentum do,
		// before it is recognized.
		const drags = count('drag');
		expect(drags).toBeGreaterThanOrEqual(swipe.length);
		expect(drags).toBeLessThan(swipe.length + 15);
		// The lift carries on the way the fingers went, near their speed (600 px/s).
		const up = calls.find((c) => c[0] === 'up')!;
		expect(up[1]).toBeGreaterThan(250);
		expect(up[1]).toBeLessThan(650);
		expect(up[2]).toBeCloseTo(0);
		expect(pad.phase).toBe('coast');

		// Once the momentum has gone quiet, nothing more is said.
		pad.tick(80 * FRAME + 1000);
		expect(pad.phase).toBe('idle');
		expect(calls.length).toBe(1 + drags + 1);
	});

	it('lifts fingers that stopped before lifting with no speed, once the stream goes quiet', () => {
		const { pad, calls } = recorder();
		const swipe = steady(0, 20, 10);
		for (const e of swipe) pad.feed(e);
		const last = swipe[swipe.length - 1].t;

		pad.tick(last + 50);
		expect(pad.phase).toBe('touch');
		pad.tick(last + 500);
		expect(pad.phase).toBe('idle');
		expect(calls[calls.length - 1]).toEqual(['up', 0, 0]);
	});

	it('never takes a long, steady swipe for momentum', () => {
		const { pad, count } = recorder();
		for (const e of steady(0, 180, 6, -3)) pad.feed(e);
		expect(count('up')).toBe(0);
		expect(count('drag')).toBe(180);
	});

	it('never takes fingers gathering speed for momentum', () => {
		const { pad, count } = recorder();
		for (let i = 0; i < 40; i++) pad.feed({ t: i * FRAME, dx: 1 + i * 0.5, dy: 0 });
		expect(count('up')).toBe(0);
	});

	it('takes fingers back on the trackpad mid-momentum as a new touch', () => {
		const { pad, calls, count } = recorder();
		for (const e of [...steady(0, 20, 10), ...momentum(20 * FRAME, 30, 10)]) pad.feed(e);
		expect(count('up')).toBe(1);
		const before = calls.length;

		// A swipe back the other way.
		for (const e of steady(50 * FRAME, 10, -8)) pad.feed(e);
		const after = calls.slice(before);
		expect(after[0]).toEqual(['down']);
		expect(after.slice(1).every((c) => c[0] === 'drag' && c[1] === -8)).toBe(true);
		expect(pad.phase).toBe('touch');
	});

	it('takes fingers that pick up speed again mid-momentum as a new touch', () => {
		const { pad, calls, count } = recorder();
		for (const e of [...steady(0, 20, 10), ...momentum(20 * FRAME, 40, 10)]) pad.feed(e);
		const before = calls.length;
		for (const e of steady(60 * FRAME, 5, 12)) pad.feed(e);
		expect(calls[before]).toEqual(['down']);
		expect(count('down')).toBe(2);
	});

	it('takes up the drag again when what looked like momentum stops slowing', () => {
		const { pad, calls, count } = recorder();
		// Fingers that ease off just as momentum would, then hold that pace.
		const ease = momentum(20 * FRAME, 12, 10);
		const pace = ease[ease.length - 1].dx;
		const events = [...steady(0, 20, 10), ...ease, ...steady(32 * FRAME, 30, pace)];
		for (const e of events) pad.feed(e);

		expect(count('up')).toBe(1);
		expect(count('down')).toBe(2);
		expect(pad.phase).toBe('touch');
		// The travel held back while it seemed to be momentum is handed on when
		// the drag resumes: all that is lost is the one event read as the lift.
		const fed = events.reduce((sum, e) => sum + e.dx, 0);
		const dragged = calls.reduce((sum, c) => sum + (c[0] === 'drag' ? c[1] : 0), 0);
		expect(fed - dragged).toBeGreaterThanOrEqual(0);
		expect(fed - dragged).toBeLessThan(pace * 2);
	});

	it('believes the browser where it marks momentum', () => {
		const { pad, calls, count } = recorder();
		for (const e of steady(0, 6, 10)) pad.feed({ ...e, momentum: false });
		// Momentum that looks nothing like decay, which only the flag can reveal.
		for (const e of steady(6 * FRAME, 10, 10)) pad.feed({ ...e, momentum: true });

		expect(count('down')).toBe(1);
		expect(count('drag')).toBe(6);
		expect(count('up')).toBe(1);
		const up = calls.find((c) => c[0] === 'up')!;
		expect(up[1]).toBeGreaterThan(500);

		// And a touch it marks as fingers, however small, ends the coast.
		pad.feed({ t: 16 * FRAME, dx: 1, dy: 0, momentum: false });
		expect(count('down')).toBe(2);
	});

	it('ignores momentum arriving with no touch before it', () => {
		const { pad, calls } = recorder();
		for (const e of steady(0, 10, 10)) pad.feed({ ...e, momentum: true });
		expect(calls).toEqual([]);
	});

	it('treats a mouse wheel as a series of drags', () => {
		const { pad, count } = recorder();
		const notches = [0, 60, 95, 170, 210, 300];
		for (const t of notches) pad.feed({ t, dx: 0, dy: -100 });
		expect(count('down')).toBe(1);
		expect(count('drag')).toBe(notches.length);
		expect(count('up')).toBe(0);
	});

	it('ignores events that move nothing', () => {
		const { pad, calls } = recorder();
		pad.feed({ t: 0, dx: 0, dy: 0 });
		expect(calls).toEqual([]);
		expect(pad.phase).toBe('idle');
	});
});

describe('wheelInput', () => {
	const event = (init: WheelEventInit & { timeStamp?: number }) =>
		({ deltaX: 0, deltaY: 0, deltaMode: 0, timeStamp: 0, ...init }) as unknown as WheelEvent;

	it('turns where the page would scroll into where the fingers went', () => {
		expect(wheelInput(event({ deltaX: 4, deltaY: -6, timeStamp: 12 }), 800)).toEqual({
			t: 12,
			dx: -4,
			dy: 6,
			momentum: undefined
		});
	});

	it('measures lines and pages in px', () => {
		expect(wheelInput(event({ deltaY: 3, deltaMode: 1 }), 800).dy).toBe(-54);
		expect(wheelInput(event({ deltaY: 1, deltaMode: 2 }), 800).dy).toBe(-800);
	});

	it('passes on the browser’s word on momentum', () => {
		const e = Object.assign(event({ deltaY: 3 }), { momentum: true });
		expect(wheelInput(e, 800).momentum).toBe(true);
	});
});
