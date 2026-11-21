/**
 * The seasons the Archive Stream groups its field by: each season is one
 * island on the water, gathering that season from every year, and labeled at
 * its center ("Winter", "Spring"). So every winter in the archive sits on one
 * island, with the winters running in date order across it.
 *
 * Seasons are the meteorological ones, which follow whole months: winter is
 * December to February, spring March to May, summer June to August and fall
 * September to November. Whole months matter because an archive date is often
 * only known to the month (see #lib/partialDate), and the astronomical seasons
 * split their months at the solstices and equinoxes.
 */

import { parsePartialDate } from '#lib/partialDate.ts';

export type Season = {
	/** Sorts the seasons by plain string comparison: winter to fall, then the rest. */
	key: string;
	/** What the bubble at the island's center says. */
	label: string;
};

const NAMES = ['Winter', 'Spring', 'Summer', 'Fall'] as const;

/** Where a date known only to its year, or not at all, goes: it has no season. */
const UNKNOWN: Season = { key: 'unknown', label: 'Season unknown' };

/**
 * The season a partial date falls in, whatever its year. A date known only
 * to its year can't be placed in a season, so it shares an island with the
 * undated, sorted after the four seasons.
 */
export function seasonOf(date: string | null): Season {
	const parsed = date ? parsePartialDate(date) : null;
	if (!parsed || parsed.month === undefined) return UNKNOWN;
	// December, January and February give 0; March to May 1; and so on.
	const index = Math.floor((parsed.month % 12) / 3);
	return { key: String(index + 1), label: NAMES[index] };
}
