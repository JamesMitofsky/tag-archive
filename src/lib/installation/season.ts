/**
 * The seasons the Archive Stream groups its field by, and the years within
 * them. Each season is one archipelago on the water, gathering that season
 * from every year and named at its head ("Winter", "Spring"); within it, each
 * year is an island of its own, named at its center ("2024"). So every winter
 * in the archive sits together, and each winter's things sit together within
 * that, the years running in date order.
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
	/** What the bubble at the head of the season says. */
	label: string;
};

/** One season of one year, within its season. */
export type SeasonYear = {
	/** Sorts a season's years into date order by plain string comparison, undated last. */
	key: string;
	/** What the bubble at the year's center says: "2024", "2023–24", "Undated". */
	label: string;
};

const NAMES = ['Winter', 'Spring', 'Summer', 'Fall'] as const;

/** Where a date known only to its year, or not at all, goes: it has no season. */
const UNKNOWN: Season = { key: 'unknown', label: 'Season unknown' };

/**
 * The season a partial date falls in, whatever its year. A date known only
 * to its year can't be placed in a season, so it shares an archipelago with
 * the undated, sorted after the four seasons.
 */
export function seasonOf(date: string | null): Season {
	const parsed = date ? parsePartialDate(date) : null;
	if (!parsed || parsed.month === undefined) return UNKNOWN;
	// December, January and February give 0; March to May 1; and so on.
	const index = Math.floor((parsed.month % 12) / 3);
	return { key: String(index + 1), label: NAMES[index] };
}

/** Padded, so the keys of any two years compare as their years do, and before "undated". */
const yearKey = (year: number) => String(year).padStart(4, '0');

/**
 * Which year of its season a partial date belongs to (see `seasonOf`).
 *
 * A winter runs across New Year, so December belongs with the January and
 * February after it, and that winter is named for both its years: December
 * 2023 to February 2024 is "2023–24". That keeps each winter one island,
 * and the islands in date order. A date known only to its year is that year;
 * an undated one is "Undated", after every year.
 */
export function seasonYearOf(date: string | null): SeasonYear {
	const parsed = date ? parsePartialDate(date) : null;
	if (!parsed) return { key: 'undated', label: 'Undated' };
	const { year, month } = parsed;
	if (month === undefined || (month > 2 && month < 12)) {
		return { key: yearKey(year), label: String(year) };
	}
	const end = month === 12 ? year + 1 : year;
	// The second year is shortened to its last two digits, unless the winter
	// crosses a century, where "1999–00" would read as going backward.
	const sameCentury = Math.floor(end / 100) === Math.floor((end - 1) / 100);
	const tail = sameCentury ? String(end % 100).padStart(2, '0') : String(end);
	return { key: yearKey(end), label: `${end - 1}–${tail}` };
}
