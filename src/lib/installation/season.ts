/**
 * The seasons the Archive Stream groups its field by: each season of each year
 * is one island on the water, labeled at its center ("Winter 2024", "Spring
 * 2026"), so drifting through the field keeps a sense of when you are.
 *
 * Seasons are the meteorological ones, which follow whole months: winter is
 * December to February, spring March to May, summer June to August and fall
 * September to November. Whole months matter because an archive date is often
 * only known to the month (see #lib/partialDate), and the astronomical seasons
 * split their months at the solstices and equinoxes.
 *
 * A winter runs across New Year, so December belongs to the coming year's
 * winter: December 2023 to February 2024 is "Winter 2024". That keeps each
 * winter one group, and the groups in date order.
 */

import { parsePartialDate } from '#lib/partialDate.ts';

export type Season = {
	/** Sorts the seasons into date order by plain string comparison. */
	key: string;
	/** What the bubble at the island's center says. */
	label: string;
};

const NAMES = ['Winter', 'Spring', 'Summer', 'Fall'] as const;

/**
 * The season a partial date falls in. A date known only to its year can't be
 * placed in a season, so it gets the year alone ("2019"), sorted before that
 * year's winter; an undated one is "Undated", sorted after everything.
 */
export function seasonOf(date: string | null): Season {
	const parsed = date ? parsePartialDate(date) : null;
	if (!parsed) return { key: 'undated', label: 'Undated' };
	// Padded, so the keys of any two years compare as their years do.
	const pad = (year: number) => String(year).padStart(4, '0');
	if (parsed.month === undefined)
		return { key: `${pad(parsed.year)}-0`, label: String(parsed.year) };
	const year = parsed.month === 12 ? parsed.year + 1 : parsed.year;
	// December, January and February give 0; March to May 1; and so on.
	const index = Math.floor((parsed.month % 12) / 3);
	return { key: `${pad(year)}-${index + 1}`, label: `${NAMES[index]} ${year}` };
}
