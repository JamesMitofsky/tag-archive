import { describe, expect, it } from 'vitest';
import { bloomScale, layoutField } from './field';
import { clampKnob, defaultKnobs, KNOBS, VIEW } from './knobs';
import { TUNING } from './physics';

describe('knobs', () => {
	it('start from the tuning and the view the field is built with', () => {
		const knobs = defaultKnobs();
		expect(knobs.gain).toBe(TUNING.gain);
		expect(knobs.fling).toBe(TUNING.fling);
		expect(knobs.perScreen).toBe(VIEW.perScreen);
		expect(Object.keys(knobs).sort()).toEqual(KNOBS.map((k) => k.key).sort());
	});

	it('each default sits on its slider, within its range', () => {
		const knobs = defaultKnobs();
		for (const knob of KNOBS) {
			expect(knobs[knob.key], knob.key).toBeGreaterThanOrEqual(knob.min);
			expect(knobs[knob.key], knob.key).toBeLessThanOrEqual(knob.max);
		}
	});

	it('match the defaults the layout and the bloom fall back to', () => {
		const view = { viewW: 1920, viewH: 1080 };
		expect(layoutField([], { ...view, perScreen: VIEW.perScreen }).cell).toBe(
			layoutField([], view).cell
		);
		expect(bloomScale(100, 100, 1920, 1080, VIEW.bloom)).toBe(bloomScale(100, 100, 1920, 1080));
	});

	it('hold a remembered value to the range, and refuse what is not a number', () => {
		const gain = KNOBS.find((k) => k.key === 'gain')!;
		expect(clampKnob(gain, 99)).toBe(gain.max);
		expect(clampKnob(gain, -1)).toBe(gain.min);
		expect(clampKnob(gain, 2)).toBe(2);
		expect(clampKnob(gain, '2')).toBeNull();
		expect(clampKnob(gain, NaN)).toBeNull();
	});
});
