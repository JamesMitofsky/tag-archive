/**
 * Partial (imprecise) dates.
 *
 * An artefact's date is often only known to the month, or only to the year —
 * a program with "Summer 2019" printed on it, a photo filed under one binder
 * year. Rather than invent a false precision (or a nullable second column that
 * can drift out of sync with the value it describes), the date string itself
 * carries its precision by being *truncated*: the ISO 8601 / W3C-DTF reduced
 * forms, which is also what Dublin Core archives use.
 *
 *   2019          → year precision
 *   2019-07       → month precision
 *   2019-07-04    → day precision
 *
 * Two properties make the truncated form the robust representation:
 *  - Precision is derivable from the value, so the two can never disagree.
 *  - Lexicographic order matches chronological order, so the existing
 *    `ORDER BY date DESC` and the `(date, id)` index keep working untouched —
 *    a year-only 2019 sorts adjacent to the other 2019 rows.
 *
 * Never hand these strings to `new Date()`: it silently widens `2019-07` to
 * July 1st, which is exactly the false precision this module exists to avoid.
 * Use `formatPartialDate` to display and `startOfPartialDate` when arithmetic
 * genuinely needs a concrete day.
 *
 * An artefact may also carry no date at all — nobody knows when it is from.
 * That is stored as NULL, never as a sentinel string, so any non-null value
 * is always a real date. In forms, where every field is a string, the
 * deliberate choice travels as the `UNDATED` token (see `readDateField`).
 */

/** How much of a date is actually known. */
export type DatePrecision = 'day' | 'month' | 'year';

/** Matches any of the three accepted shapes. Shape only — see `isPartialDate`. */
export const PARTIAL_DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/** Matches a full calendar date. Shape only — see `isPartialDate`. */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Month names, indexed 1-12 by `MONTH_NAMES[month - 1]`. */
export const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
] as const;

/** The three precisions, coarse to fine — the order the picker offers them in. */
export const DATE_PRECISIONS: readonly DatePrecision[] = ['year', 'month', 'day'];

/** Human label for a precision, for pickers and hints. */
export const PRECISION_LABELS: Record<DatePrecision, string> = {
	day: 'Exact day',
	month: 'Month',
	year: 'Year'
};

/** Days in `month` (1-12) of `year`, Gregorian leap years included. */
export function daysInMonth(year: number, month: number): number {
	// Day 0 of the *next* month is the last day of this one.
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The `{ year, month?, day? }` a partial date names, or null if it names none. */
export function parsePartialDate(
	value: string
): { year: number; month?: number; day?: number; precision: DatePrecision } | null {
	const raw = (value ?? '').trim();
	if (!PARTIAL_DATE_RE.test(raw)) return null;

	const [yearPart, monthPart, dayPart] = raw.split('-');
	const year = Number(yearPart);
	if (year < 1) return null;
	if (monthPart === undefined) return { year, precision: 'year' };

	const month = Number(monthPart);
	if (month < 1 || month > 12) return null;
	if (dayPart === undefined) return { year, month, precision: 'month' };

	const day = Number(dayPart);
	if (day < 1 || day > daysInMonth(year, month)) return null;
	return { year, month, day, precision: 'day' };
}

/** True when `value` is a real date at year, month, or day precision. */
export function isPartialDate(value: string): boolean {
	return parsePartialDate(value) !== null;
}

/** True when `value` is a real date pinned to an exact day. */
export function isFullDate(value: string): boolean {
	return parsePartialDate(value)?.precision === 'day';
}

/** How precise `value` is, or null when it isn't a date at all. */
export function datePrecision(value: string): DatePrecision | null {
	return parsePartialDate(value)?.precision ?? null;
}

/** Zero-pad to `width`, e.g. `pad(7, 2)` → `'07'`. */
const pad = (n: number, width: number) => String(n).padStart(width, '0');

/**
 * Build the truncated string for a precision, dropping the parts it doesn't
 * cover. Callers keep a full year/month/day in the picker so switching
 * precision back and forth doesn't lose what the user already chose.
 */
export function formatPartialDateValue(
	year: number,
	month: number,
	day: number,
	precision: DatePrecision
): string {
	if (precision === 'year') return pad(year, 4);
	if (precision === 'month') return `${pad(year, 4)}-${pad(month, 2)}`;
	return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * Widen a partial date to the first day of the span it covers, as `YYYY-MM-DD`.
 * Only for arithmetic that needs a concrete day (e.g. ranking events by how
 * near they fall to an artefact's date) — never for display, where it would
 * pass off a guess as a fact. Null when `value` isn't a date.
 */
export function startOfPartialDate(value: string): string | null {
	const parsed = parsePartialDate(value);
	if (!parsed) return null;
	return formatPartialDateValue(parsed.year, parsed.month ?? 1, parsed.day ?? 1, 'day');
}

/**
 * Render a partial date at the precision it actually carries — "2019",
 * "July 2019", "July 4, 2019" — so an imprecise date never reads as an exact
 * one. `short` swaps the long month name for its abbreviation. Anything
 * unparseable falls back to the raw string rather than "Invalid Date".
 */
export function formatPartialDate(value: string, { short = false } = {}): string {
	const parsed = parsePartialDate(value);
	if (!parsed) return value;

	const { year, month, day, precision } = parsed;
	if (precision === 'year') return String(year);

	const name = MONTH_NAMES[month! - 1];
	const monthLabel = short ? name.slice(0, 3) : name;
	if (precision === 'month') return `${monthLabel} ${year}`;
	return `${monthLabel} ${day}, ${year}`;
}

/**
 * Form value for "this artefact deliberately has no date". Only ever lives in
 * a form field: `readDateField` turns it into null before validation and
 * storage. It is distinct from an empty field, which means nothing was chosen
 * yet — so a forgotten date can't silently become an undated artefact.
 */
export const UNDATED = 'undated';

/**
 * Read a submitted date field: the `UNDATED` token becomes null (no date,
 * deliberately); anything else comes back trimmed, with '' meaning "not
 * chosen" for validation to reject.
 */
export function readDateField(raw: string): string | null {
	const value = (raw ?? '').trim();
	return value === UNDATED ? null : value;
}

/** The form-field value for a stored date — the inverse of `readDateField`. */
export function dateFieldValue(stored: string | null): string {
	return stored ?? UNDATED;
}
