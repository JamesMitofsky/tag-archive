/**
 * Canonical TAG program areas — the single source of truth used app-wide.
 *
 * `artefact.programArea` is a free-form JSON string array in the DB, but every
 * value seen in the source export maps to one of these six. Import from here
 * (`$lib/programAreas`) instead of hardcoding strings/colours anywhere else so
 * labels, ordering, and colours stay consistent across UI.
 */

export const PROGRAM_AREAS = [
	'DIY',
	'Learning Landscape',
	'Playground',
	'Spotlight',
	'TAG Committee',
	'Wellbeing'
] as const;

export type ProgramArea = (typeof PROGRAM_AREAS)[number];

export interface ProgramAreaMeta {
	/** Canonical label as stored/displayed. */
	label: ProgramArea;
	/** Tailwind classes for a pill (background + text). Colour carries meaning. */
	pill: string;
	/** Solid accent colour (e.g. dots, borders). */
	accent: string;
}

export const PROGRAM_AREA_META: Record<ProgramArea, ProgramAreaMeta> = {
	DIY: {
		label: 'DIY',
		pill: 'bg-amber-500/15 text-amber-800',
		accent: 'bg-amber-500'
	},
	'Learning Landscape': {
		label: 'Learning Landscape',
		pill: 'bg-emerald-500/15 text-emerald-800',
		accent: 'bg-emerald-500'
	},
	Playground: {
		label: 'Playground',
		pill: 'bg-sky-500/15 text-sky-800',
		accent: 'bg-sky-500'
	},
	Spotlight: {
		label: 'Spotlight',
		pill: 'bg-fuchsia-500/15 text-fuchsia-800',
		accent: 'bg-fuchsia-500'
	},
	'TAG Committee': {
		label: 'TAG Committee',
		pill: 'bg-indigo-500/15 text-indigo-800',
		accent: 'bg-indigo-500'
	},
	Wellbeing: {
		label: 'Wellbeing',
		pill: 'bg-rose-500/15 text-rose-800',
		accent: 'bg-rose-500'
	}
};

/** Fallback for any tag not in the canonical set (defensive; keeps UI robust). */
export const PROGRAM_AREA_FALLBACK: ProgramAreaMeta = {
	label: 'DIY', // unused; label read from the raw tag at call site
	pill: 'bg-gray-800/10 text-gray-800',
	accent: 'bg-gray-400'
};

/** Meta for a raw tag string, falling back gracefully for unknown values. */
export function programAreaMeta(tag: string): ProgramAreaMeta {
	return PROGRAM_AREA_META[tag as ProgramArea] ?? PROGRAM_AREA_FALLBACK;
}
