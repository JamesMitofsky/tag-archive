import { describe, expect, it } from 'vitest';
import {
	createExpirySuite,
	createRemoteKeySuite,
	KEY_RE,
	parseRemoteKeyForm,
	randomSuffix,
	utcDate
} from './remoteKey';

const TODAY = '2026-11-18';
const errors = (key: string, expiresOn = '2026-11-25') =>
	createRemoteKeySuite(TODAY)({ key, expiresOn }).getErrors();

describe('createRemoteKeySuite', () => {
	it('accepts a link-friendly key with a date from today on', () => {
		expect(errors('tobyshorin')).toEqual({});
		expect(errors('toby-shorin-7q2k', TODAY)).toEqual({});
	});

	it.each([
		'',
		'ab',
		'toby shorin',
		'toby_shorin',
		'-toby',
		'toby-',
		'to--by',
		'zoë',
		'a'.repeat(65)
	])('refuses the key %j', (key) => {
		expect(errors(key).key?.length).toBeGreaterThan(0);
	});

	it.each(['', '2026-11-17', '2026-02-31', 'next week'])('refuses the expiry %j', (expiresOn) => {
		expect(errors('tobyshorin', expiresOn).expiresOn?.length).toBeGreaterThan(0);
		expect(createExpirySuite(TODAY)({ expiresOn }).isValid()).toBe(false);
	});

	it('lowercases and trims what was typed', () => {
		const fd = new FormData();
		fd.set('key', '  TobyShorin ');
		fd.set('expiresOn', ' 2026-11-25 ');
		expect(parseRemoteKeyForm(fd)).toEqual({ key: 'tobyshorin', expiresOn: '2026-11-25' });
	});
});

describe('helpers', () => {
	it('counts days on the UTC calendar', () => {
		expect(utcDate(new Date('2026-11-18T23:30:00-05:00'))).toBe('2026-11-19');
		expect(utcDate(new Date('2026-11-18T12:00:00Z'), 7)).toBe('2026-11-25');
	});

	it('makes random endings that are valid in a key', () => {
		for (let i = 0; i < 50; i++) expect(randomSuffix()).toMatch(KEY_RE);
		expect(randomSuffix()).toHaveLength(6);
	});
});
