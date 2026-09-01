import { describe, expect, it } from 'vitest';
import {
	containFit,
	cornerList,
	fullFrameCorners,
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

	it('centres the object-contain letterbox on both axes', () => {
		// Source wider than the box: bars top and bottom.
		expect(containFit(1000, 500, 400, 400)).toMatchObject({
			scale: 0.4,
			offsetX: 0,
			offsetY: 100,
			drawW: 400,
			drawH: 200
		});

		// Source taller than the box: bars left and right.
		expect(containFit(500, 1000, 400, 400)).toMatchObject({
			scale: 0.4,
			offsetX: 100,
			offsetY: 0
		});

		// Matching aspect ratio: fills exactly, no offset.
		expect(containFit(1600, 1200, 800, 600)).toMatchObject({ offsetX: 0, offsetY: 0, scale: 0.5 });
	});

	it('degrades to a zero fit when the video has no intrinsic size yet', () => {
		expect(containFit(0, 0, 400, 400).scale).toBe(0);
	});

	it('rejects non-finite and zero-area frames', () => {
		const broken = fullFrameCorners(100, 100);
		broken.topLeft = { x: Number.NaN, y: 0 };

		expect(isPlausibleQuad(broken, 100, 100)).toBe(false);
		expect(isPlausibleQuad(fullFrameCorners(100, 100), 0, 0)).toBe(false);
	});
});
