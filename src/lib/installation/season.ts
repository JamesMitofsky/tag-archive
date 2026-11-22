/**
 * The calendar the Archive Stream lays its field out on: a column for each
 * year and, within it, a row for each season. So every winter sits on one row,
 * the winters side by side in year order, and drifting along a row is seeing
 * what was happening at that time of year, year after year.
 *
 * Seasons are the meteorological ones, which follow whole months: winter is
 * December to February, spring March to May, summer June to August and fall
 * September to November. Whole months matter because an archive date is often
 * only known to the month (see #lib/partialDate), and the astronomical seasons
 * split their months at the solstices and equinoxes.
 *
 * A season stays within its calendar year, so a year's winter holds its own
 * January, February and December. Along the winter row that still reads in
 * date order: one year's December sits just before the next year's January.
 */

import { parsePartialDate } from '#lib/partialDate.ts';

export type Season = {
	/** Sorts the seasons by plain string comparison: winter to fall, then the rest. */
	key: string;
	/** What the season's mark at the screen's edge says. */
	label: string;
};

export type Year = {
	/** Sorts the years by plain string comparison: oldest first, the undated last. */
	key: string;
	/** What the year's mark at the screen's edge says. */
	label: string;
};

const NAMES = ['Winter', 'Spring', 'Summer', 'Fall'] as const;

/** Where a date known only to its year, or not at all, goes: it has no season. */
const UNKNOWN: Season = { key: 'unknown', label: 'Season unknown' };

/** Where an undated thing goes: after every year ('~' sorts after the digits). */
const UNDATED: Year = { key: '~undated', label: 'Undated' };

/**
 * The season a partial date falls in, whatever its year. A date known only
 * to its year can't be placed in a season, so it shares a row with the
 * undated, sorted after the four seasons.
 */
export function seasonOf(date: string | null): Season {
	const parsed = date ? parsePartialDate(date) : null;
	if (!parsed || parsed.month === undefined) return UNKNOWN;
	// December, January and February give 0; March to May 1; and so on.
	const index = Math.floor((parsed.month % 12) / 3);
	return { key: String(index + 1), label: NAMES[index] };
}

/** The calendar year a partial date falls in, or the undated column's. */
export function yearOf(date: string | null): Year {
	const parsed = date ? parsePartialDate(date) : null;
	if (!parsed) return UNDATED;
	return { key: String(parsed.year).padStart(4, '0'), label: String(parsed.year) };
}
