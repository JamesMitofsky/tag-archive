import { describe, expect, it } from 'vitest';
import {
	albumParticulars,
	formatClock,
	formatTotal,
	titleFromFileName,
	totalDuration,
	trackCount
} from './format';

describe('titleFromFileName', () => {
	it.each([
		['01 - INTRODUCTION.mp3', 'INTRODUCTION'],
		['05 - ocean drum.mp3', 'ocean drum'],
		['3. Heart.flac', 'Heart'],
		['07_Sacral_Chant.wav', 'Sacral Chant'],
		['12 Four Directions.m4a', 'Four Directions'],
		['13 - THROAT pt.1.mp3', 'THROAT pt.1'],
		// A number with nothing after it is the title, not a position.
		['1999.mp3', '1999'],
		['01.mp3', '01'],
		['', 'Untitled track']
	])('%s → %s', (name, title) => {
		expect(titleFromFileName(name)).toBe(title);
	});
});

describe('clock and running lengths', () => {
	it('reads seconds as a clock', () => {
		expect(formatClock(65.9)).toBe('1:05');
		expect(formatClock(3729)).toBe('1:02:09');
		expect(formatClock(null)).toBe('–:––');
		expect(formatClock(Number.NaN)).toBe('–:––');
	});

	it('totals only when every length is known', () => {
		expect(totalDuration([60, 120.5])).toBe(180.5);
		expect(totalDuration([60, null])).toBeNull();
		expect(totalDuration([])).toBeNull();
		expect(formatTotal(2520)).toBe('42 min');
		expect(formatTotal(3900)).toBe('1 hr 5 min');
		expect(formatTotal(21)).toBe('21 sec');
	});

	it('prints an album’s particulars, leaving out what it lacks', () => {
		const tracks = [{ duration: 1200 }, { duration: 1260 }];
		expect(albumParticulars({ date: '2024-06', event: 'Solstice Concert', tracks })).toBe(
			'June 2024 · Solstice Concert · 2 tracks · 41 min'
		);
		expect(albumParticulars({ date: null, event: null, tracks: [{ duration: null }] })).toBe(
			'Undated · 1 track'
		);
		expect(trackCount(12)).toBe('12 tracks');
	});
});
