/**
 * Runs async tasks one at a time.
 *
 * The scanner pushes every full-size image through this: decoding, detecting,
 * dewarping and encoding a 2560px photo each hold a canvas tens of megabytes
 * large, and iOS Safari caps total canvas memory, so a burst of shots processed
 * side by side can fail where the same shots processed in turn would not.
 *
 * Two lanes, each first in first out. Whenever a task finishes, the next
 * `interactive` task starts ahead of any `background` one, so work someone is
 * waiting on (finding the page in a photo the crop step will show) doesn't sit
 * behind work nobody is watching (the previous run's crops and encodes).
 *
 * A task that throws rejects only its own promise; the queue moves on.
 */
export type Lane = 'interactive' | 'background';

export type SerialQueue = {
	run<T>(task: () => Promise<T>, lane?: Lane): Promise<T>;
};

export function createSerialQueue(): SerialQueue {
	const waiting: Record<Lane, Array<() => void>> = { interactive: [], background: [] };
	let busy = false;

	function next() {
		const start = waiting.interactive.shift() ?? waiting.background.shift();
		busy = !!start;
		start?.();
	}

	return {
		run(task, lane = 'interactive') {
			return new Promise((resolve, reject) => {
				waiting[lane].push(() => {
					// Settled either way before the next task starts; a synchronous
					// throw inside `task` becomes this task's rejection too.
					Promise.resolve().then(task).then(resolve, reject).then(next);
				});
				if (!busy) next();
			});
		}
	};
}
