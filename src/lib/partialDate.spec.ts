import { describe, it, expect } from 'vitest';
import {
	datePrecision,
	daysInMonth,
	formatPartialDate,
	formatPartialDateValue,
	isFullDate,
	isPartialDate,
	parsePartialDate,
	startOfPartialDate
} from './partialDate';

describe('parsePartialDate', () => {
	it('reads the precision off the shape of the string', () => {
		expect(parsePartialDate('2019')).toEqual({ year: 2019, precision: 'year' });
		expect(parsePartialDate('2019-07')).toEqual({ year: 2019, month: 7, precision: 'month' });
		expect(parsePartialDate('2019-07-04')).toEqual({
			year: 2019,
			month: 7,
			day: 4,
			precision: 'day'
		});
	});

	it('trims surrounding whitespace', () => {
		expect(datePrecision('  2019-07  ')).toBe('month');
	});

	it('rejects malformed shapes', () => {
		for (const value of ['', 'nope', '19', '2019-7', '2019-07-4', '2019-07-04T00:00', '2019-']) {
			expect(parsePartialDate(value)).toBeNull();
		}
	});

	it('rejects dates that look right but cannot exist', () => {
		expect(parsePartialDate('2019-00')).toBeNull();
		expect(parsePartialDate('2019-13')).toBeNull();
		expect(parsePartialDate('2019-02-30')).toBeNull();
		expect(parsePartialDate('2019-07-00')).toBeNull();
		expect(parsePartialDate('0000')).toBeNull();
	});

	it('honours leap years', () => {
		expect(isPartialDate('2020-02-29')).toBe(true);
		expect(isPartialDate('2019-02-29')).toBe(false);
		// 1900 is divisible by 100 but not 400 — not a leap year.
		expect(isPartialDate('1900-02-29')).toBe(false);
		expect(isPartialDate('2000-02-29')).toBe(true);
	});
});

describe('daysInMonth', () => {
	it('covers the month-length cases', () => {
		expect(daysInMonth(2019, 1)).toBe(31);
		expect(daysInMonth(2019, 4)).toBe(30);
		expect(daysInMonth(2019, 2)).toBe(28);
		expect(daysInMonth(2020, 2)).toBe(29);
		expect(daysInMonth(2019, 12)).toBe(31);
	});
});

describe('isFullDate', () => {
	it('accepts only day precision', () => {
		expect(isFullDate('2019-07-04')).toBe(true);
		expect(isFullDate('2019-07')).toBe(false);
		expect(isFullDate('2019')).toBe(false);
	});
});

describe('formatPartialDate', () => {
	it('never renders more precision than the value carries', () => {
		expect(formatPartialDate('2019')).toBe('2019');
		expect(formatPartialDate('2019-07')).toBe('July 2019');
		expect(formatPartialDate('2019-07-04')).toBe('July 4, 2019');
	});

	it('abbreviates the month when short', () => {
		expect(formatPartialDate('2019', { short: true })).toBe('2019');
		expect(formatPartialDate('2019-07', { short: true })).toBe('Jul 2019');
		expect(formatPartialDate('2019-07-04', { short: true })).toBe('Jul 4, 2019');
	});

	it('falls back to the raw string rather than showing Invalid Date', () => {
		expect(formatPartialDate('sometime in the 90s')).toBe('sometime in the 90s');
		expect(formatPartialDate('')).toBe('');
	});

	it('reads a day-precise date in its own calendar terms, not the local timezone', () => {
		// `new Date('2019-01-01')` is midnight UTC, which is Dec 31 in the Americas.
		// Parsing the parts directly keeps the rendered day equal to the stored one.
		expect(formatPartialDate('2019-01-01')).toBe('January 1, 2019');
		expect(formatPartialDate('2019-12-31')).toBe('December 31, 2019');
	});
});

describe('formatPartialDateValue', () => {
	it('truncates to the requested precision', () => {
		expect(formatPartialDateValue(2019, 7, 4, 'day')).toBe('2019-07-04');
		expect(formatPartialDateValue(2019, 7, 4, 'month')).toBe('2019-07');
		expect(formatPartialDateValue(2019, 7, 4, 'year')).toBe('2019');
	});

	it('zero-pads so the strings stay sortable', () => {
		expect(formatPartialDateValue(2019, 1, 2, 'day')).toBe('2019-01-02');
		expect(formatPartialDateValue(880, 1, 2, 'year')).toBe('0880');
	});
});

describe('startOfPartialDate', () => {
	it('widens to the first day of the span it covers', () => {
		expect(startOfPartialDate('2019')).toBe('2019-01-01');
		expect(startOfPartialDate('2019-07')).toBe('2019-07-01');
		expect(startOfPartialDate('2019-07-04')).toBe('2019-07-04');
	});

	it('is null for a non-date', () => {
		expect(startOfPartialDate('whenever')).toBeNull();
	});
});

describe('sort order', () => {
	it('sorts lexicographically the same way it sorts chronologically', () => {
		const values = ['2020-01-01', '2019-07', '2019', '2019-07-04', '2019-01-01', '2020'];
		expect([...values].sort()).toEqual([
			'2019',
			'2019-01-01',
			'2019-07',
			'2019-07-04',
			'2020',
			'2020-01-01'
		]);
	});
});
