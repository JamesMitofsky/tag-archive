import { describe, expect, it } from 'vitest';
import { seasonOf } from './season';

describe('seasonOf', () => {
	it('names the meteorological season and its year', () => {
		expect(seasonOf('2024-03-01').label).toBe('Spring 2024');
		expect(seasonOf('2024-05-31').label).toBe('Spring 2024');
		expect(seasonOf('2024-06').label).toBe('Summer 2024');
		expect(seasonOf('2024-09-15').label).toBe('Fall 2024');
		expect(seasonOf('2024-11-30').label).toBe('Fall 2024');
		expect(seasonOf('2024-01-10').label).toBe('Winter 2024');
		expect(seasonOf('2024-02').label).toBe('Winter 2024');
	});

	it('counts December toward the coming winter, so a winter is one season', () => {
		expect(seasonOf('2023-12-20')).toEqual(seasonOf('2024-02-01'));
		expect(seasonOf('2023-12').label).toBe('Winter 2024');
	});

	it('gives a year-only date its year, and an undated one its own group', () => {
		expect(seasonOf('2019').label).toBe('2019');
		expect(seasonOf(null).label).toBe('Undated');
		expect(seasonOf('not a date').label).toBe('Undated');
	});

	it('keys sort into date order', () => {
		const dates = ['2023-11-30', '2023-12-01', '2024', '2024-03', '2024-08', '2024-10', null];
		const keys = dates.map((d) => seasonOf(d).key);
		// A year-only date comes before its year's winter, which began in December.
		expect([...keys].sort()).toEqual([
			keys[0],
			keys[2],
			keys[1],
			keys[3],
			keys[4],
			keys[5],
			keys[6]
		]);
	});
});
