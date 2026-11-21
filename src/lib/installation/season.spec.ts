import { describe, expect, it } from 'vitest';
import { seasonOf, seasonYearOf } from './season';

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

describe('seasonYearOf', () => {
	it('names the year, or a winter by both of its years', () => {
		expect(seasonYearOf('2024-07-04').label).toBe('2024');
		expect(seasonYearOf('2024-03').label).toBe('2024');
		expect(seasonYearOf('2024-11-30').label).toBe('2024');
		expect(seasonYearOf('2023-12-20').label).toBe('2023–24');
		expect(seasonYearOf('2024-01').label).toBe('2023–24');
		expect(seasonYearOf('2024-02-29').label).toBe('2023–24');
		expect(seasonYearOf('2024-12').label).toBe('2024–25');
	});

	it('keeps a December with the winter after it', () => {
		expect(seasonYearOf('2023-12-01')).toEqual(seasonYearOf('2024-02-28'));
		expect(seasonYearOf('2023-12-01')).not.toEqual(seasonYearOf('2023-02-28'));
	});

	it('writes out both years of a winter across a century', () => {
		expect(seasonYearOf('1999-12').label).toBe('1999–2000');
		expect(seasonYearOf('2009-12').label).toBe('2009–10');
	});

	it('gives a year-only date its year, and the undated their own group', () => {
		expect(seasonYearOf('2019').label).toBe('2019');
		expect(seasonYearOf(null).label).toBe('Undated');
		expect(seasonYearOf('not a date')).toEqual(seasonYearOf(null));
	});

	it('keys sort into date order, undated last', () => {
		const dates = [null, '2024-01', '2019', '2023-12', '2024-12', '1987'];
		const sorted = dates.map((d) => seasonYearOf(d)).sort((a, b) => (a.key < b.key ? -1 : 1));
		expect(sorted.map((s) => s.label)).toEqual([
			'1987',
			'2019',
			'2023–24',
			'2023–24',
			'2024–25',
			'Undated'
		]);
	});
});
