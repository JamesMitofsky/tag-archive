import { describe, expect, it } from 'vitest';
import { DC, frameDistance, skyFrame } from './engine';
import { SKY_PALETTE } from './palette';
import { MAX_STEP_DE, STEPS_MS, nextRepaintDelay, skyClock } from './schedule';

const frameAt = (ms: number) => skyFrame(ms, SKY_PALETTE, DC.lat, DC.lon);

/** Run the scheduler through one day, as the live sky would. */
function simulateDay(startIso: string) {
	let t = Date.parse(startIso);
	const end = t + 86400000;
	const steps: { at: number; delay: number; change: number }[] = [];
	while (t < end) {
		const delay = nextRepaintDelay(t, frameAt);
		steps.push({ at: t, delay, change: frameDistance(frameAt(t), frameAt(t + delay)) });
		t += delay;
	}
	return steps;
}

describe('nextRepaintDelay', () => {
	for (const day of ['2026-03-20', '2026-06-21', '2026-12-21']) {
		it(`never lets the sky jump visibly between repaints (${day})`, () => {
			const steps = simulateDay(`${day}T04:00:00Z`);
			expect(Math.max(...steps.map((s) => s.change))).toBeLessThanOrEqual(MAX_STEP_DE);
		});
	}

	it('sleeps long through the day and night, and steps quickly through dusk', () => {
		const steps = simulateDay('2026-06-21T04:00:00Z');
		const delayAt = (iso: string) => steps.findLast((s) => s.at <= Date.parse(iso))!.delay;
		expect(delayAt('2026-06-21T13:00:00-04:00')).toBe(STEPS_MS.at(-1)); // noon
		expect(delayAt('2026-06-22T02:00:00-04:00')).toBe(STEPS_MS.at(-1)); // deep night
		expect(delayAt('2026-06-21T20:40:00-04:00')).toBeLessThanOrEqual(60_000); // dusk
	});

	it('stays cheap: a few hundred repaints a day', () => {
		for (const day of ['2026-03-20', '2026-06-21', '2026-12-21']) {
			expect(simulateDay(`${day}T04:00:00Z`).length).toBeLessThan(600);
		}
	});
});

describe('skyClock', () => {
	it('is real time by default', () => {
		const clock = skyClock('', () => 1_000);
		expect(clock.speed).toBe(1);
		expect(clock.now()).toBe(1_000);
	});

	it('honours ?sky-at= and ?sky-speed= for previews', () => {
		let real = 0;
		const clock = skyClock('?sky-at=2026-06-21T20:00:00-04:00&sky-speed=600', () => real);
		expect(clock.now()).toBe(Date.parse('2026-06-21T20:00:00-04:00'));
		real = 1_000;
		expect(clock.now()).toBe(Date.parse('2026-06-21T20:00:00-04:00') + 600_000);
	});

	it('ignores nonsense parameters', () => {
		const clock = skyClock('?sky-at=yesterday-ish&sky-speed=-3', () => 5);
		expect(clock.now()).toBe(5);
		expect(clock.speed).toBe(1);
	});
});
