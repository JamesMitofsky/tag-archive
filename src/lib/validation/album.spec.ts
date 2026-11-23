import { describe, expect, it } from 'vitest';
import { createAlbumSuite, parseAlbumForm, type AlbumData } from './album';

const form = (entries: [string, string][]) => {
	const fd = new FormData();
	for (const [name, value] of entries) fd.append(name, value);
	return fd;
};

const valid: AlbumData = {
	title: 'Songs from the Garden',
	artist: '',
	description: '',
	event: '',
	eventId: null,
	date: '2024',
	tracks: [{ id: 3, title: 'Root' }]
};

describe('parseAlbumForm', () => {
	it('pairs each track id with the title written beside it, in order', () => {
		const data = parseAlbumForm(
			form([
				['title', ' Songs '],
				['date', '2024-06'],
				['trackIds', '7'],
				['trackTitles', ' Opening '],
				['trackIds', '3'],
				['trackTitles', 'Closing']
			])
		);
		expect(data.title).toBe('Songs');
		expect(data.date).toBe('2024-06');
		expect(data.tracks).toEqual([
			{ id: 7, title: 'Opening' },
			{ id: 3, title: 'Closing' }
		]);
	});

	it('pads lists that differ in length with values the suite refuses, never mispairing', () => {
		const data = parseAlbumForm(
			form([
				['trackIds', '7'],
				['trackIds', '3'],
				['trackTitles', 'Only one']
			])
		);
		expect(data.tracks).toEqual([
			{ id: 7, title: 'Only one' },
			{ id: 3, title: '' }
		]);
		expect(createAlbumSuite()({ ...valid, tracks: data.tracks }).isValid()).toBe(false);
	});
});

describe('createAlbumSuite', () => {
	const errors = (data: Partial<AlbumData>) =>
		createAlbumSuite()({ ...valid, ...data }).getErrors();

	it('passes a complete album', () => {
		expect(createAlbumSuite()(valid).isValid()).toBe(true);
	});

	it('wants a title, a date answer, and at least one titled track', () => {
		expect(errors({ title: '' }).title).toEqual(['Title required']);
		expect(errors({ date: '' }).date).toEqual(['Pick a date, or choose “No date”']);
		expect(errors({ date: null }).date).toBeUndefined();
		expect(errors({ tracks: [] }).tracks).toContain('Add at least one track');
		expect(errors({ tracks: [{ id: 3, title: '' }] }).tracks).toContain('Give every track a title');
	});

	it('refuses ids that are not distinct positive whole numbers', () => {
		const dup = [
			{ id: 3, title: 'a' },
			{ id: 3, title: 'b' }
		];
		expect(errors({ tracks: dup }).tracks).toContain('Those tracks could not be attached');
		expect(errors({ tracks: [{ id: Number.NaN, title: 'a' }] }).tracks).toContain(
			'Those tracks could not be attached'
		);
	});
});
