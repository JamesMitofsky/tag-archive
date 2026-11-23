import { describe, expect, it } from 'vitest';
import { seasonOf, yearOf } from './season';

describe('seasonOf', () => {
	it('names the meteorological season', () => {
		expect(seasonOf('2024-03-01').label).toBe('Spring');
		expect(seasonOf('2024-05-31').label).toBe('Spring');
		expect(seasonOf('2024-06').label).toBe('Summer');
		expect(seasonOf('2024-09-15').label).toBe('Fall');
		expect(seasonOf('2024-11-30').label).toBe('Fall');
		expect(seasonOf('2024-01-10').label).toBe('Winter');
		expect(seasonOf('2024-02').label).toBe('Winter');
		expect(seasonOf('2023-12-20').label).toBe('Winter');
	});

	it('gathers a season from every year into one', () => {
		expect(seasonOf('2016-07-04')).toEqual(seasonOf('2025-08-30'));
		expect(seasonOf('2019-12')).toEqual(seasonOf('2024-01-02'));
	});

	it('gives year-only and undated dates one group of their own', () => {
		expect(seasonOf('2019').label).toBe('Season unknown');
		expect(seasonOf(null)).toEqual(seasonOf('2019'));
		expect(seasonOf('not a date')).toEqual(seasonOf('2019'));
	});

	it('keys sort winter to fall, then the unknown', () => {
		const dates = ['2024', '2023-10', '2025-07', '2020-04', '2021-01'];
		const sorted = dates.map((d) => seasonOf(d)).sort((a, b) => (a.key < b.key ? -1 : 1));
		expect(sorted.map((s) => s.label)).toEqual([
			'Winter',
			'Spring',
			'Summer',
			'Fall',
			'Season unknown'
		]);
	});
});

describe('yearOf', () => {
	it('names the calendar year, so a December stays in its own', () => {
		expect(yearOf('2023-12-20').label).toBe('2023');
		expect(yearOf('2024-01').label).toBe('2024');
		expect(yearOf('2019')).toEqual(yearOf('2019-07-04'));
	});

	it('gives the undated a column of their own, after every year', () => {
		expect(yearOf(null).label).toBe('Undated');
		expect(yearOf('not a date')).toEqual(yearOf(null));
		expect(yearOf('2024').key < yearOf(null).key).toBe(true);
		expect(yearOf('0999').key < yearOf('2024').key).toBe(true);
	});
});
