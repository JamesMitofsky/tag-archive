import { describe, expect, it } from 'vitest';
import {
	cornerList,
	fullFrameCorners,
	isFullFrame,
	isPlausibleQuad,
	quadArea,
	scaleCorners,
	type CornerPoints
} from './detect';

const quad = (w: number, h: number, inset = 0): CornerPoints => ({
	topLeft: { x: inset, y: inset },
	topRight: { x: w - inset, y: inset },
	bottomRight: { x: w - inset, y: h - inset },
	bottomLeft: { x: inset, y: h - inset }
});

describe('scanner geometry', () => {
	it('lists corners in draw order', () => {
		const pts = cornerList(fullFrameCorners(100, 50));
		expect(pts).toEqual([
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 50 },
			{ x: 0, y: 50 }
		]);
	});

	it('scales a detection-space quad into full-resolution space', () => {
		const detected = quad(480, 360, 40);
		const scaled = scaleCorners(detected, 4032 / 480, 3024 / 360);

		expect(scaled.topLeft).toEqual({ x: 336, y: 336 });
		expect(scaled.bottomRight).toEqual({ x: 3696, y: 2688 });
	});

	it('measures quad area regardless of winding', () => {
		expect(quadArea(fullFrameCorners(200, 100))).toBe(20000);

		const reversed: CornerPoints = {
			topLeft: { x: 0, y: 0 },
			topRight: { x: 0, y: 100 },
			bottomRight: { x: 200, y: 100 },
			bottomLeft: { x: 200, y: 0 }
		};
		expect(quadArea(reversed)).toBe(20000);
	});

	it('rejects detections too small to be the document being aimed at', () => {
		// A logo-sized rectangle inside the frame: 5% coverage.
		const speck = quad(0, 0);
		speck.topRight = { x: 100, y: 0 };
		speck.bottomRight = { x: 100, y: 50 };
		speck.bottomLeft = { x: 0, y: 50 };

		expect(isPlausibleQuad(speck, 1000, 100)).toBe(false);
		expect(isPlausibleQuad(quad(1000, 100, 10), 1000, 100)).toBe(true);
	});

	it('recognises the whole frame, within a pixel', () => {
		expect(isFullFrame(fullFrameCorners(640, 480), 640, 480)).toBe(true);
		// What a corner editor hands back after a drag to the very edge.
		const nudged = fullFrameCorners(640, 480);
		nudged.bottomRight = { x: 639.4, y: 479.6 };
		expect(isFullFrame(nudged, 640, 480)).toBe(true);

		expect(isFullFrame(quad(640, 480, 2), 640, 480)).toBe(false);
		expect(isFullFrame(fullFrameCorners(640, 480), 1280, 960)).toBe(false);
	});

	it('rejects non-finite and zero-area frames', () => {
		const broken = fullFrameCorners(100, 100);
		broken.topLeft = { x: Number.NaN, y: 0 };

		expect(isPlausibleQuad(broken, 100, 100)).toBe(false);
		expect(isPlausibleQuad(fullFrameCorners(100, 100), 0, 0)).toBe(false);
	});
});
