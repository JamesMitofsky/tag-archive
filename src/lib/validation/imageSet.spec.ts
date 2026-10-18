import { describe, expect, it } from 'vitest';
import { UNDATED } from '$lib/partialDate';
import { createImageSetSuite, MAX_IMAGES_PER_SET, parseImageSetForm } from './imageSet';

function fd(entries: Record<string, string | string[]>): FormData {
	const form = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		for (const v of Array.isArray(value) ? value : [value]) form.append(key, v);
	}
	return form;
}

const run = createImageSetSuite();

describe('parseImageSetForm', () => {
	it('reads ordered ids, the auto-date flag and an optional override', () => {
		expect(
			parseImageSetForm(
				fd({ description: ' Picnic ', event: 'Concert', imageIds: ['3', '1'], dateAuto: 'on' })
			)
		).toEqual({
			description: 'Picnic',
			event: 'Concert',
			imageIds: [3, 1],
			date: '',
			dateAuto: true
		});
		expect(parseImageSetForm(fd({ imageIds: '1', date: UNDATED }))).toMatchObject({
			date: null,
			dateAuto: false
		});
	});

	it('parses anything but a plain number to NaN', () => {
		expect(parseImageSetForm(fd({ imageIds: ['1.5', '-2', '0x3', '4'] })).imageIds).toEqual([
			NaN,
			NaN,
			NaN,
			4
		]);
	});
});

describe('image set suite', () => {
	const valid = { imageIds: ['1', '2'], dateAuto: 'on' };

	it('accepts a set with only photographs', () => {
		expect(run(parseImageSetForm(fd(valid))).isValid()).toBe(true);
	});

	it('requires at least one photograph, and caps the count', () => {
		const none = run(parseImageSetForm(fd({ dateAuto: 'on' })));
		expect(none.getErrors('imageIds')).toContain('Add at least one photograph');
		const tooMany = Array.from({ length: MAX_IMAGES_PER_SET + 1 }, (_, i) => String(i + 1));
		const over = run(parseImageSetForm(fd({ imageIds: tooMany, dateAuto: 'on' })));
		expect(over.getErrors('imageIds')).toContain(`Add at most ${MAX_IMAGES_PER_SET} photographs`);
	});

	it('refuses repeated or malformed ids', () => {
		for (const imageIds of [['1', '1'], ['abc'], ['0']]) {
			const r = run(parseImageSetForm(fd({ imageIds, dateAuto: 'on' })));
			expect(r.getErrors('imageIds')).toContain('Those photographs could not be attached');
		}
	});

	it('limits the description and event lengths', () => {
		const r = run(
			parseImageSetForm(fd({ ...valid, description: 'x'.repeat(2001), event: 'y'.repeat(201) }))
		);
		expect(r.getErrors('description')).toHaveLength(1);
		expect(r.getErrors('event')).toHaveLength(1);
	});

	it('ignores the date while it follows the photographs', () => {
		expect(run(parseImageSetForm(fd({ ...valid, date: 'not a date' }))).isValid()).toBe(true);
	});

	it('checks an overridden date like an artefact’s', () => {
		const manual = { imageIds: ['1'] };
		expect(run(parseImageSetForm(fd(manual))).getErrors('date')).toEqual([
			'Pick a date, or choose “No date”'
		]);
		expect(run(parseImageSetForm(fd({ ...manual, date: '2024-02-30' }))).getErrors('date')).toEqual(
			['Pick a valid date']
		);
		for (const date of ['2024', '2024-06', '2024-06-01', UNDATED]) {
			expect(run(parseImageSetForm(fd({ ...manual, date }))).isValid()).toBe(true);
		}
	});
});
