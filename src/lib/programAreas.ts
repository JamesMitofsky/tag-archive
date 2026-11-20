/**
 * Canonical TAG program areas — the single source of truth used app-wide.
 *
 * `artefact.programArea` is a free-form JSON string array in the DB, but every
 * value seen in the source export maps to one of these six. Import from here
 * (`#lib/programAreas.ts`) instead of hardcoding strings/colours anywhere else so
 * labels, ordering, and colours stay consistent across UI.
 */

import type { Component } from 'svelte';
import HammerIcon from 'phosphor-svelte/lib/HammerIcon';
import BookOpenIcon from 'phosphor-svelte/lib/BookOpenIcon';
import ShapesIcon from 'phosphor-svelte/lib/ShapesIcon';
import { Spotlight as SpotlightIcon } from '@lucide/svelte';
import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
import HeartIcon from 'phosphor-svelte/lib/HeartIcon';
import CircleIcon from 'phosphor-svelte/lib/CircleIcon';

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
	/**
	 * The accent's hue as a watercolor wash: a CSS color, lighter and less
	 * saturated than the Tailwind 500 it follows, so it sits on the painted
	 * sky the way the clouds do. For decoration that paints with all six areas
	 * at once (the sign-in confetti), not for anything that labels an area.
	 */
	wash: string;
	/** Phosphor icon component representing the area. */
	icon: Component;
}

export const PROGRAM_AREA_META: Record<ProgramArea, ProgramAreaMeta> = {
	DIY: {
		label: 'DIY',
		pill: 'bg-amber-500/15 text-amber-800',
		accent: 'bg-amber-500',
		wash: 'oklch(0.79 0.12 72)',
		icon: HammerIcon
	},
	'Learning Landscape': {
		label: 'Learning Landscape',
		pill: 'bg-emerald-500/15 text-emerald-800',
		accent: 'bg-emerald-500',
		wash: 'oklch(0.71 0.1 162)',
		icon: BookOpenIcon
	},
	Playground: {
		label: 'Playground',
		pill: 'bg-sky-500/15 text-sky-800',
		accent: 'bg-sky-500',
		wash: 'oklch(0.7 0.1 237)',
		icon: ShapesIcon
	},
	Spotlight: {
		label: 'Spotlight',
		pill: 'bg-fuchsia-500/15 text-fuchsia-800',
		accent: 'bg-fuchsia-500',
		wash: 'oklch(0.7 0.13 328)',
		icon: SpotlightIcon
	},
	'TAG Committee': {
		label: 'TAG Committee',
		pill: 'bg-indigo-500/15 text-indigo-800',
		accent: 'bg-indigo-500',
		wash: 'oklch(0.64 0.11 277)',
		icon: UsersThreeIcon
	},
	Wellbeing: {
		label: 'Wellbeing',
		pill: 'bg-rose-500/15 text-rose-800',
		accent: 'bg-rose-500',
		wash: 'oklch(0.7 0.13 14)',
		icon: HeartIcon
	}
};

/** Fallback for any tag not in the canonical set (defensive; keeps UI robust). */
export const PROGRAM_AREA_FALLBACK: ProgramAreaMeta = {
	label: 'DIY', // unused; label read from the raw tag at call site
	pill: 'bg-gray-800/10 text-gray-800',
	accent: 'bg-gray-400',
	wash: 'oklch(0.72 0 0)',
	icon: CircleIcon
};

/** Meta for a raw tag string, falling back gracefully for unknown values. */
export function programAreaMeta(tag: string): ProgramAreaMeta {
	return PROGRAM_AREA_META[tag as ProgramArea] ?? PROGRAM_AREA_FALLBACK;
}

/**
 * What each program area is, in the TAG Season 4 Lookbook's own words: the
 * Stump Fellowship's "focus areas", copied verbatim (spelling, curly quotes and
 * the doubled em dashes included). Never reword them. `lead` is the sentence the
 * lookbook sets in bold and `body` is the rest of its paragraph.
 *
 * Five of the six areas have a lookbook entry, under a slightly different name
 * for two of them (Local Spotlight, Mind-Body Wellbeing). TAG Committee has none,
 * so it has no description here. The lookbook's Service and Seasonal
 * Celebrations are not program areas in the archive, so they are left out.
 */
export const PROGRAM_AREA_DESCRIPTIONS: Partial<
	Record<ProgramArea, { lead: string; body: string }>
> = {
	DIY: {
		lead: 'Cultivating craft in and for community.',
		body: 'Inspired by the deep history of DC’s D.I.Y. scene, we host workshops, meetups, and jam sessions where aspiring creatives learn skills like mending, collaging, glass art, songwriting, zine-making, and more.'
	},
	'Learning Landscape': {
		lead: 'Connecting residents to local history, ecology, and each other through site-specific curriculum.',
		body: 'We’ve designed original courses, field trips, and “flowerside chats” in partnership with universities and elementary schools——teaching students of all ages about the stories of U Street’s plants, animals, and people.'
	},
	Wellbeing: {
		lead: 'Providing a launching pad for newly-trained teachers and healers to share their practices.',
		body: 'It’s no secret that gardens benefit our health. Whether it’s harvesting nutritious veggies and calming herbal teas, meditating with the birds, doing yoga under the big sky after a long day of work, or soaking in the sounds of a gong bath——TAG has green medicine for all.'
	},
	Spotlight: {
		lead: 'Highlighting local up-and-coming musicians, comedians, actors, and producers on our performance stage.',
		body: 'We transform the garden into an intimate and interactive venue for 100+ guests, with free shows that boost community pride and “bring up our own”. USNA’s stipends, photos, videos, and live recordings help featured artists find their next gig and expand their followings.'
	},
	Playground: {
		lead: 'Reconnecting with childlike creativity through experimental games and gatherings.',
		body: 'We playtest home-grown immersive experiences like “Turtling” (a slowmotion jogging club) and an entomological adventure called “Bugs Under Bricks”. New event types are shared with other community spaces, unlocking ways of being together that add a little extra to the ordinary.'
	}
};
