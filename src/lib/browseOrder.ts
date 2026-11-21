/**
 * The order the public clouds browse the archive in when nothing is searched.
 *
 * Still a fresh random draw on every visit, but not a uniform one: an item
 * whose own date sits near today is more likely to be dealt near the front,
 * so the sky leans toward what is happening now (this week's events, last
 * month's photographs) without ever shutting out the older or undated parts
 * of the archive.
 */
import { daysInMonth, parsePartialDate } from '#lib/partialDate.ts';

const MS_PER_DAY = 86_400_000;

/**
 * Days for an item's pull toward the front to halve. A year suits an archive
 * spanning many: last year's items still turn up often, ten-year-old ones
 * settle toward the floor.
 */
export const HALF_LIFE_DAYS = 365;

/**
 * The weight no item falls below, however old, and what an undated item gets.
 * Against a weight of 1 for an item dated today, it keeps the oldest items in
 * the draw at a tenth of the odds rather than effectively never.
 */
export const FLOOR_WEIGHT = 0.1;

/** A calendar day as a whole-day count since the epoch, free of time zones. */
function dayNumber(year: number, month: number, day: number): number {
	return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/**
 * How many days lie between `today` and the span a partial date names, or
 * null when `value` isn't a date. A partial date is a span, not a point:
 * "2019" covers the whole year, so any day in it is 0 days away, and a day
 * after it is measured from December 31st rather than from a false January 1st
 * (see #lib/partialDate). Future dates count the same as past ones, so an
 * upcoming event is as near as a recent one.
 */
export function daysFromToday(value: string, today: Date): number | null {
	const parsed = parsePartialDate(value);
	if (!parsed) return null;
	const { year, month, day } = parsed;
	const start = dayNumber(year, month ?? 1, day ?? 1);
	const endMonth = month ?? 12;
	const end = dayNumber(year, endMonth, day ?? daysInMonth(year, endMonth));
	// The reader's own calendar day, wherever they are.
	const now = dayNumber(today.getFullYear(), today.getMonth() + 1, today.getDate());
	if (now < start) return start - now;
	if (now > end) return now - end;
	return 0;
}

/**
 * An item's weight in the draw, in [FLOOR_WEIGHT, 1]: 1 for a date spanning
 * today, decaying by half every `HALF_LIFE_DAYS` toward the floor. Undated or
 * unreadable dates take the floor.
 */
export function dateWeight(value: string | null, today: Date): number {
	const days = value ? daysFromToday(value, today) : null;
	if (days === null) return FLOOR_WEIGHT;
	return FLOOR_WEIGHT + (1 - FLOOR_WEIGHT) * 2 ** (-days / HALF_LIFE_DAYS);
}

/**
 * A weighted random permutation, returned as a NEW array (the caller's list is
 * usually a shared, cached dataset). Each place is filled as if drawing from
 * what remains with odds proportional to weight, which is the
 * Efraimidis–Spirakis method: every item gets the key `u^(1/w)` for a uniform
 * `u`, and the order is the keys, largest first. The keys are compared as
 * `ln(u)/w`, the same order without the underflow of raising a small `u` to a
 * large power. Weights must be positive.
 */
export function weightedShuffled<T>(
	items: readonly T[],
	weight: (item: T) => number,
	random: () => number = Math.random
): T[] {
	return items
		.map((item) => ({ item, key: Math.log(random()) / weight(item) }))
		.sort((a, b) => b.key - a.key)
		.map((k) => k.item);
}

/** `items` in a random order that favors dates near `today` (see above). */
export function dateWeightedOrder<T>(
	items: readonly T[],
	dateOf: (item: T) => string | null,
	today: Date = new Date(),
	random: () => number = Math.random
): T[] {
	return weightedShuffled(items, (item) => dateWeight(dateOf(item), today), random);
}
