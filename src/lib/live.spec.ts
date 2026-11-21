import { describe, expect, it } from 'vitest';
import { assignSlots, LIVE_WINDOW_MS, withinWindow, type LiveArrival } from './live';

function arrival(id: number, arrivedAt: number): LiveArrival {
	return {
		id,
		artefact: `Artefact ${id}`,
		event: null,
		date: null,
		description: null,
		programArea: [],
		fileUrls: [],
		provenance: [],
		arrivedAt
	};
}

const MINUTE = 60 * 1000;

describe('withinWindow', () => {
	const openedAt = Date.UTC(2026, 10, 21, 18, 0);

	it('keeps what arrived up to an hour before the board opened, and since', () => {
		const feed = [
			arrival(4, openedAt + 5 * MINUTE),
			arrival(3, openedAt - 30 * MINUTE),
			arrival(2, openedAt - LIVE_WINDOW_MS)
		];
		expect(feed.filter((a) => withinWindow(a, openedAt)).map((a) => a.id)).toEqual([4, 3, 2]);
	});

	it('leaves out what arrived earlier, such as an hour and a half before', () => {
		const feed = [arrival(2, openedAt - 90 * MINUTE), arrival(1, openedAt - LIVE_WINDOW_MS - 1)];
		expect(feed.filter((a) => withinWindow(a, openedAt))).toEqual([]);
	});
});

describe('assignSlots', () => {
	it('fills the slots in order, oldest arrival first', () => {
		const shown = [arrival(9, 300), arrival(4, 200), arrival(7, 100)];
		expect(assignSlots({}, shown, 6)).toEqual({ 7: 0, 4: 1, 9: 2 });
	});

	it('keeps every page in its slot when another arrives', () => {
		const before = { 7: 0, 4: 1 };
		const shown = [arrival(9, 300), arrival(4, 200), arrival(7, 100)];
		expect(assignSlots(before, shown, 6)).toEqual({ 7: 0, 4: 1, 9: 2 });
	});

	it('hands a newcomer the slot a departed page left', () => {
		const before = { 1: 0, 2: 1, 3: 2 };
		const shown = [arrival(4, 400), arrival(3, 300), arrival(2, 200)];
		expect(assignSlots(before, shown, 3)).toEqual({ 2: 1, 3: 2, 4: 0 });
	});

	it('gives no slot to what does not fit, and drops slots the board no longer has', () => {
		const before = { 1: 5 };
		const shown = [arrival(3, 300), arrival(2, 200), arrival(1, 100)];
		expect(assignSlots(before, shown, 2)).toEqual({ 1: 0, 2: 1 });
	});
});
