/**
 * What the operator can tune on the projector while the Archive Stream runs:
 * how the field answers a hand (a subset of ./physics's TUNING) and how it is
 * drawn. Each is a slider in the overlay. Changes are remembered on the
 * device, like the kinds shown (see ./kinds), so a projector tuned for the
 * room comes back that way after a reload.
 */

import { TUNING, type Tuning } from './physics.ts';

/** How the field is drawn, as opposed to how it moves. */
export type View = {
	/** About how many items one screen shows: the zoom. Fewer is closer. */
	perScreen: number;
	/** The lens's radius, as a share of the screen's height. */
	lens: number;
	/** How much of the screen's height an item in focus grows to fill. */
	bloom: number;
	/** How long the field must be still on an item before its caption shows (s). */
	captionAfter: number;
};

export const VIEW: View = { perScreen: 37, lens: 0.18, bloom: 0.62, captionAfter: 0.7 };

type TunedKey =
	| 'gain'
	| 'fling'
	| 'glideHalfLife'
	| 'maxSpeed'
	| 'followOmega'
	| 'magnetSpeed'
	| 'magnetOmega'
	| 'idleAfter'
	| 'currentSpeed';

export type Knobs = Pick<Tuning, TunedKey> & View;

export type Knob = {
	key: keyof Knobs;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
};

/** The sliders, in the order shown: the hand first, then the settle, then the picture. */
export const KNOBS: readonly Knob[] = [
	{ key: 'gain', label: 'drag gain', min: 0.1, max: 6, step: 0.1, unit: '×' },
	{ key: 'fling', label: 'flick strength', min: 0, max: 1.5, step: 0.05, unit: '×' },
	{ key: 'glideHalfLife', label: 'glide half-life', min: 0.05, max: 1.5, step: 0.05, unit: 's' },
	{ key: 'maxSpeed', label: 'top speed', min: 500, max: 8000, step: 100, unit: 'px/s' },
	{ key: 'followOmega', label: 'follow', min: 4, max: 40, step: 1, unit: '/s' },
	{ key: 'magnetSpeed', label: 'magnet below', min: 0, max: 600, step: 10, unit: 'px/s' },
	{ key: 'magnetOmega', label: 'magnet pull', min: 1, max: 12, step: 0.2, unit: '/s' },
	{ key: 'idleAfter', label: 'idle after', min: 5, max: 300, step: 5, unit: 's' },
	{ key: 'currentSpeed', label: 'current', min: 0, max: 120, step: 2, unit: 'px/s' },
	{ key: 'perScreen', label: 'items per screen', min: 6, max: 80, step: 1, unit: '' },
	{ key: 'lens', label: 'lens radius', min: 0.05, max: 0.5, step: 0.01, unit: '× height' },
	{ key: 'bloom', label: 'bloom size', min: 0.2, max: 0.95, step: 0.01, unit: '× height' },
	{ key: 'captionAfter', label: 'caption after', min: 0, max: 3, step: 0.1, unit: 's' }
];

export function defaultKnobs(): Knobs {
	const knobs = { ...VIEW } as Knobs;
	for (const { key } of KNOBS) if (key in TUNING) knobs[key] = TUNING[key as TunedKey];
	return knobs;
}

const STORAGE_KEY = 'archive-stream:knobs';

function store(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

/** `value` held to the knob's range; null when it isn't a number at all. */
export function clampKnob(knob: Knob, value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return Math.min(knob.max, Math.max(knob.min, value));
}

/** The defaults, with whatever this device remembers changing laid over them. */
export function readKnobs(): Knobs {
	const knobs = defaultKnobs();
	let stored: Record<string, unknown> = {};
	try {
		const parsed: unknown = JSON.parse(store()?.getItem(STORAGE_KEY) ?? '{}');
		if (parsed && typeof parsed === 'object') stored = parsed as Record<string, unknown>;
	} catch {
		// Nothing readable is nothing remembered.
	}
	for (const knob of KNOBS) knobs[knob.key] = clampKnob(knob, stored[knob.key]) ?? knobs[knob.key];
	return knobs;
}

/**
 * Only what differs from the defaults is stored, so a knob nobody touched
 * follows the default when a later version changes it.
 */
export function rememberKnobs(knobs: Knobs): void {
	const defaults = defaultKnobs();
	const changed: Partial<Knobs> = {};
	for (const { key } of KNOBS) if (knobs[key] !== defaults[key]) changed[key] = knobs[key];
	try {
		if (Object.keys(changed).length) store()?.setItem(STORAGE_KEY, JSON.stringify(changed));
		else store()?.removeItem(STORAGE_KEY);
	} catch {
		// A full or blocked store only costs the memory, not the setting.
	}
}
