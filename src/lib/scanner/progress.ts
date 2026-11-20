/**
 * How long until a photo's page has been found, for the loader shown while
 * someone waits on it.
 *
 * Photos are prepared one at a time, in the order shot, and each takes about
 * as long as the last few did on this device. So the wait for a photo is the
 * rest of the one being worked on now, plus a typical photo's worth for each
 * one between it and the front of the line, itself included.
 *
 * Pure, so it is unit-tested in the node project.
 */

/** A photo waiting to be prepared; `startedAt` (ms) is set once its turn has come. */
export type Waiting = { id: string; startedAt: number | null };

/** A photo's worth of work before any has been timed on this device. */
export const DEFAULT_MS = 2000;
/** Recent photos the typical time is taken from. */
const RECENT = 5;
/**
 * Least ever promised for the photo being worked on. One that overruns its
 * estimate is "almost done", not finished and not counting up again.
 */
const FLOOR_MS = 500;

/**
 * The time a photo takes, from those just timed: the median of the last few,
 * so one slow photo (a stall, a tab left in the background) doesn't inflate
 * every estimate after it.
 */
export function typicalMs(samples: number[]): number {
	const recent = samples.slice(-RECENT).sort((a, b) => a - b);
	if (recent.length === 0) return DEFAULT_MS;
	const middle = Math.floor(recent.length / 2);
	return recent.length % 2 ? recent[middle] : (recent[middle - 1] + recent[middle]) / 2;
}

/** Milliseconds until `id` is ready; 0 if it isn't waiting. `queue` is in the order worked through. */
export function remainingMs(queue: Waiting[], id: string, typical: number, now: number): number {
	const ahead = queue.findIndex((item) => item.id === id);
	if (ahead < 0) return 0;
	const head = queue[0];
	const current =
		head.startedAt === null ? typical : Math.max(FLOOR_MS, typical - (now - head.startedAt));
	return current + ahead * typical;
}

/** `ms` as the loader words it. Whole seconds, rounded up: a wait is better over- than under-stated. */
export function describeRemaining(ms: number): string {
	if (ms <= 1000) return 'Almost done';
	return `About ${Math.ceil(ms / 1000)} seconds left`;
}
