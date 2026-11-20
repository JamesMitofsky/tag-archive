/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import modelUrl from './models/u2netp.onnx?url';
import { MASK_SIZE, type SegmentReply, type SegmentRequest } from './segment.protocol';

/**
 * Runs the segmentation model off the main thread: one inference is about a
 * second of solid computation on a phone, which on the main thread would
 * freeze the camera's shutter and the review's gestures for as long.
 */

// The runtime's default is to look for its .wasm next to its own script,
// which a bundled worker chunk is not; Vite gives the hashed URL instead.
ort.env.wasm.wasmPaths = { wasm: wasmUrl };
// More threads need a cross-origin isolated page (COOP/COEP), which this
// site is not, so asking for them would only cost a failed attempt.
ort.env.wasm.numThreads = 1;

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const PIXELS = MASK_SIZE * MASK_SIZE;

let session: Promise<ort.InferenceSession> | null = null;

function load(): Promise<ort.InferenceSession> {
	session ??= ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
	// A failed load (a dropped connection) is forgotten, so the next photo retries.
	session.catch(() => (session = null));
	return session;
}

async function segment(rgba: Uint8ClampedArray): Promise<Float32Array> {
	const model = await load();
	const input = new Float32Array(3 * PIXELS);
	for (let i = 0; i < PIXELS; i++) {
		for (let c = 0; c < 3; c++) {
			input[c * PIXELS + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c];
		}
	}
	const outputs = await model.run({
		[model.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, MASK_SIZE, MASK_SIZE])
	});
	// The first output is the fused, full-resolution mask; the rest are the
	// network's intermediate side outputs.
	return outputs[model.outputNames[0]].data as Float32Array;
}

self.onmessage = async (event: MessageEvent<SegmentRequest>) => {
	const { id, rgba } = event.data;
	const post = (reply: SegmentReply, transfer: Transferable[] = []) =>
		self.postMessage(reply, { transfer });
	try {
		if (!rgba) {
			await load();
			post({ id, ok: true });
			return;
		}
		// Copied out of the runtime's heap, so it can be handed over, not cloned.
		const mask = new Float32Array(await segment(rgba));
		post({ id, ok: true, mask }, [mask.buffer]);
	} catch (error) {
		post({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
	}
};
