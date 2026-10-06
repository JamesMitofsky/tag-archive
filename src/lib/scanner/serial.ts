/**
 * Runs async tasks one at a time, in the order they were queued.
 *
 * The scanner pushes every full-size image through this: decoding, detecting,
 * dewarping and encoding a 2560px photo each hold a canvas tens of megabytes
 * large, and iOS Safari caps total canvas memory, so a burst of shots processed
 * side by side can fail where the same shots processed in turn would not.
 *
 * A task that throws rejects only its own promise; the queue moves on.
 */
export type SerialQueue = {
	run<T>(task: () => Promise<T>): Promise<T>;
};

export function createSerialQueue(): SerialQueue {
	let tail: Promise<unknown> = Promise.resolve();
	return {
		run(task) {
			const result = tail.then(task);
			// The next task waits for this one to settle, not to succeed.
			tail = result.catch(() => undefined);
			return result;
		}
	};
}
