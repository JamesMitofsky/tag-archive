import { describe, expect, it } from 'vitest';
import { createSerialQueue } from './serial';

/** A promise plus the function that settles it, so a test decides when a task ends. */
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
}

describe('createSerialQueue', () => {
	it('runs tasks one at a time, in the order they were queued', async () => {
		const queue = createSerialQueue();
		const log: string[] = [];
		const first = deferred();

		const a = queue.run(async () => {
			log.push('a start');
			await first.promise;
			log.push('a end');
		});
		const b = queue.run(async () => {
			log.push('b');
		});

		// Let microtasks drain: b must still be waiting on a.
		await Promise.resolve();
		await Promise.resolve();
		expect(log).toEqual(['a start']);

		first.resolve();
		await Promise.all([a, b]);
		expect(log).toEqual(['a start', 'a end', 'b']);
	});

	it('hands each task its own result', async () => {
		const queue = createSerialQueue();
		await expect(
			Promise.all([queue.run(async () => 1), queue.run(async () => 'two')])
		).resolves.toEqual([1, 'two']);
	});

	it('starts waiting interactive work before waiting background work', async () => {
		const queue = createSerialQueue();
		const log: string[] = [];
		const first = deferred();

		const running = queue.run(async () => {
			await first.promise;
			log.push('running');
		}, 'background');
		const later = [
			queue.run(async () => void log.push('background 1'), 'background'),
			queue.run(async () => void log.push('background 2'), 'background'),
			queue.run(async () => void log.push('interactive'))
		];

		first.resolve();
		await Promise.all([running, ...later]);
		// The task already running finishes first; nothing is pre-empted.
		expect(log).toEqual(['running', 'interactive', 'background 1', 'background 2']);
	});

	it('runs a task that throws synchronously as a rejection, not a stall', async () => {
		const queue = createSerialQueue();
		const thrown = queue.run(() => {
			throw new Error('sync');
		});
		await expect(thrown).rejects.toThrow('sync');
		await expect(queue.run(async () => 'after')).resolves.toBe('after');
	});

	it('keeps going after a task fails, and rejects only that task', async () => {
		const queue = createSerialQueue();
		const failed = queue.run(async () => {
			throw new Error('boom');
		});
		const next = queue.run(async () => 'still runs');

		await expect(failed).rejects.toThrow('boom');
		await expect(next).resolves.toBe('still runs');
	});
});
