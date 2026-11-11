import { describe, expect, it } from 'vitest';
import { artefactEventIndexes, seriesBanners, type EventSource } from './seed-core';

const ev = (title: string, date: string, series?: string): EventSource => ({
	title,
	...(series ? { series } : {}),
	date,
	time: null,
	location: null,
	description: null,
	hosts: [],
	url: null
});

describe('seriesBanners', () => {
	it('groups by explicit series, else title, at five or more events', () => {
		const events = [
			...Array.from({ length: 5 }, (_, i) =>
				ev(`Music ft. ${i}`, '2026-01-01', 'Music in the Garden')
			),
			...Array.from({ length: 4 }, () => ev('Gong Bath', '2026-01-01'))
		];
		expect(seriesBanners(events)).toEqual([
			...Array(5).fill('Music in the Garden'),
			...Array(4).fill(null)
		]);
	});
});

describe('artefactEventIndexes', () => {
	const events = [
		ev('Death Cafe', '2026-07-09'),
		ev('Music in the Garden', '2025-07-18'),
		ev('Music in the Garden', '2025-08-01')
	];

	it('links a dated artefact to the same-titled event on its date', () => {
		expect(
			artefactEventIndexes(events, [{ event: 'Music in the Garden', date: '2025-08-01' }])
		).toEqual([2]);
	});

	it('never links a dated artefact to a same-titled event on another date', () => {
		// A 2023 Death Cafe artefact is not from the 2026 Death Cafe, even though
		// that is the only event with the title.
		expect(artefactEventIndexes(events, [{ event: 'Death Cafe', date: '2023-11-01' }])).toEqual([
			null
		]);
	});

	it('links an undated artefact by title only when exactly one event has it', () => {
		expect(
			artefactEventIndexes(events, [
				{ event: 'Death Cafe', date: '' },
				{ event: 'Music in the Garden', date: '' },
				{ event: null, date: '' }
			])
		).toEqual([0, null, null]);
	});
});
