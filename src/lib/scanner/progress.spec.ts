import { describe, expect, it } from 'vitest';
import { DEFAULT_MS, describeRemaining, remainingMs, typicalMs } from './progress';

describe('typicalMs', () => {
	it('assumes a default before anything has been timed', () => {
		expect(typicalMs([])).toBe(DEFAULT_MS);
	});

	it('takes the median, so one stalled photo does not inflate the rest', () => {
		expect(typicalMs([1500, 9000, 1700])).toBe(1700);
		expect(typicalMs([1000, 2000])).toBe(1500);
	});

	it('follows the last few photos only', () => {
		expect(typicalMs([9000, 9000, 9000, 1000, 1000, 1000, 1000, 1000])).toBe(1000);
	});
});

describe('remainingMs', () => {
	const queue = [
		{ id: 'a', startedAt: 10_000 },
		{ id: 'b', startedAt: null },
		{ id: 'c', startedAt: null }
	];

	it('is nothing for a photo that is not waiting', () => {
		expect(remainingMs(queue, 'z', 2000, 10_500)).toBe(0);
	});

	it('is the rest of the photo being worked on', () => {
		expect(remainingMs(queue, 'a', 2000, 10_500)).toBe(1500);
	});

	it('adds a typical photo for each one in line, itself included', () => {
		expect(remainingMs(queue, 'c', 2000, 10_500)).toBe(5500);
	});

	it('never reaches zero for a photo that overruns', () => {
		expect(remainingMs(queue, 'a', 2000, 60_000)).toBe(500);
		expect(remainingMs(queue, 'b', 2000, 60_000)).toBe(2500);
	});

	it('counts the whole of a photo whose turn has not come', () => {
		expect(remainingMs([{ id: 'a', startedAt: null }], 'a', 2000, 0)).toBe(2000);
	});
});

describe('describeRemaining', () => {
	it('rounds up to whole seconds', () => {
		expect(describeRemaining(2100)).toBe('About 3 seconds left');
		expect(describeRemaining(2000)).toBe('About 2 seconds left');
	});

	it('stops counting in the last second', () => {
		expect(describeRemaining(1000)).toBe('Almost done');
		expect(describeRemaining(300)).toBe('Almost done');
	});
});
