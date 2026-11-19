import { describe, expect, it } from 'vitest';
import { readCapped } from './streams';

// --- readCapped ------------------------------------------------------------

describe('readCapped', () => {
	/** A body streamed in `chunks` chunks of `size` bytes, counting how many were pulled. */
	function streamed(chunks: number, size: number) {
		let pulled = 0;
		let canceled = false;
		// No high-water mark, so nothing is pulled until someone reads.
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					if (pulled === chunks) return controller.close();
					pulled++;
					controller.enqueue(new Uint8Array(size).fill(pulled));
				},
				cancel() {
					canceled = true;
				}
			},
			{ highWaterMark: 0 }
		);
		return { body, pulled: () => pulled, canceled: () => canceled };
	}

	it('reads a body within the cap, chunks joined in order', async () => {
		const { body } = streamed(3, 4);
		const bytes = await readCapped({ body, headers: new Headers() }, 12);
		expect(Array.from(bytes ?? [])).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
	});

	it('refuses a declared Content-Length over the cap without reading a byte', async () => {
		const { body, pulled, canceled } = streamed(3, 4);
		const headers = new Headers({ 'content-length': '13' });
		expect(await readCapped({ body, headers }, 12)).toBeNull();
		expect(pulled()).toBe(0);
		expect(canceled()).toBe(true);
	});

	it('stops reading an undeclared body as soon as it passes the cap', async () => {
		const { body, pulled, canceled } = streamed(1000, 4);
		expect(await readCapped({ body, headers: new Headers() }, 10)).toBeNull();
		expect(pulled()).toBeLessThan(10);
		expect(canceled()).toBe(true);
	});

	it('reads an absent body as empty', async () => {
		expect(await readCapped({ body: null, headers: new Headers() }, 10)).toEqual(new Uint8Array());
	});
});
