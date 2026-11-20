/** Messages between segment.ts and its worker. */

/** Side of the square the model reads and of the mask it writes. */
export const MASK_SIZE = 320;

/** With `rgba` (MASK_SIZE² pixels): segment it. Without: just load the model. */
export type SegmentRequest = { id: number; rgba?: Uint8ClampedArray };

export type SegmentReply =
	{ id: number; ok: true; mask?: Float32Array } | { id: number; ok: false; error: string };
