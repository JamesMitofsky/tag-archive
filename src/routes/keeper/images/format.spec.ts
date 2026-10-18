import { describe, expect, it } from 'vitest';
import { imageSetLabel } from '$lib/images/label';
import {
	formatCapturedAt,
	formatFileSize,
	formatImageType,
	formatSetMeta,
	withoutTitleLine
} from './format';

describe('formatCapturedAt', () => {
	it('reads a wall-clock time as written, whatever zone the viewer is in', () => {
		expect(formatCapturedAt('2023-07-04T14:05:09')).toBe('July 4, 2023 at 2:05:09 PM');
		expect(formatCapturedAt('2023-07-04T00:00:00')).toBe('July 4, 2023 at 12:00:00 AM');
		expect(formatCapturedAt('2023-07-04T12:30:00')).toBe('July 4, 2023 at 12:30:00 PM');
		// Late on New Year's Eve stays there: no Date, so no shift into another day.
		expect(formatCapturedAt('2023-12-31T23:59:59')).toBe('December 31, 2023 at 11:59:59 PM');
	});

	it('names the offset the camera recorded alongside the time', () => {
		expect(formatCapturedAt('2023-07-04T14:05:09', '+02:00')).toBe(
			'July 4, 2023 at 2:05:09 PM (UTC+02:00)'
		);
		expect(formatCapturedAt('2023-07-04T09:00:00', '-05:30')).toBe(
			'July 4, 2023 at 9:00:00 AM (UTC-05:30)'
		);
		// Malformed offsets are left out rather than printed.
		expect(formatCapturedAt('2023-07-04T09:00:00', 'Z')).toBe('July 4, 2023 at 9:00:00 AM');
	});

	it('reads a day-only capture date as just the day', () => {
		expect(formatCapturedAt('2023-07-04')).toBe('July 4, 2023');
		expect(formatCapturedAt('2023-07-04', '+02:00')).toBe('July 4, 2023');
	});

	it('hands back anything it does not recognize unchanged', () => {
		for (const raw of ['2023-02-30T10:00:00', '2023-07-04T25:00:00', '2023-07', 'yesterday']) {
			expect(formatCapturedAt(raw)).toBe(raw);
		}
	});
});

describe('formatFileSize', () => {
	it('picks the unit people expect', () => {
		expect(formatFileSize(1)).toBe('1 byte');
		expect(formatFileSize(812)).toBe('812 bytes');
		expect(formatFileSize(640 * 1024)).toBe('640 KB');
		expect(formatFileSize(4.2 * 1024 * 1024)).toBe('4.2 MB');
		// Never "1024 KB".
		expect(formatFileSize(1024 * 1024 - 1)).toBe('1.0 MB');
	});
});

describe('formatImageType', () => {
	it('names the archive’s types, and passes anything else through', () => {
		expect(formatImageType('image/jpeg')).toBe('JPEG');
		expect(formatImageType('image/heic')).toBe('HEIC');
		expect(formatImageType('image/webp')).toBe('WebP');
		expect(formatImageType('image/tiff')).toBe('image/tiff');
	});
});

describe('formatSetMeta', () => {
	it('reads date, event and count, skipping what the label borrowed', () => {
		const set = { date: '2024-06-01', event: 'Vetted Concert', count: 2 };
		expect(formatSetMeta(set, 'Front row')).toBe('June 1, 2024 · Vetted Concert · 2 photographs');
		expect(formatSetMeta(set, imageSetLabel(set))).toBe('June 1, 2024 · 2 photographs');

		const bare = { date: null, event: null, count: 1 };
		expect(formatSetMeta(bare, imageSetLabel(bare))).toBe('Undated');
		expect(formatSetMeta({ ...bare, date: '2019-07' }, 'Picnic')).toBe('July 2019 · 1 photograph');
	});
});

describe('withoutTitleLine', () => {
	it('drops the first line when it is the label', () => {
		const description = 'Picnic in the garden\n\nEveryone brought a dish.';
		const label = imageSetLabel({ description, count: 3 });
		expect(withoutTitleLine(description, label)).toBe('Everyone brought a dish.');
		expect(withoutTitleLine('  Picnic in the garden  ', 'Picnic in the garden')).toBeNull();
	});

	it('keeps the whole description when the label came from elsewhere', () => {
		const description = 'Picnic in the garden\nEveryone brought a dish.';
		const label = imageSetLabel({ event: 'Summer Picnic', description });
		expect(withoutTitleLine(description, label)).toBe(description);
	});

	it('keeps a first line too long to be the label whole', () => {
		const description = 'x'.repeat(100);
		expect(withoutTitleLine(description, imageSetLabel({ description }))).toBe(description);
	});

	it('prints nothing for a blank description', () => {
		expect(withoutTitleLine(null, '3 photographs')).toBeNull();
		expect(withoutTitleLine(' \n ', '3 photographs')).toBeNull();
	});
});
