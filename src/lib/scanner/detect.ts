import { browser } from '$app/environment';
import type { CornerPoints, Point, Scanner } from 'scanic';

export type { CornerPoints, Point };

/**
 * Every call into scanic goes through this module, so the "library failed to
 * load" and "nothing was detected" paths are handled in exactly one place and
 * the rest of the app can treat detection as best-effort.
 *
 * scanic is only ever reached through `await import()` inside a function: that
 * keeps its ~100KB inlined-WASM payload out of the initial bundle and out of
 * the SSR module graph, so this file is safe to import anywhere.
 */

let scannerPromise: Promise<Scanner | null> | null = null;

/** Lazily build the single persistent Scanner. Resolves `null` if unavailable. */
export function getScanner(): Promise<Scanner | null> {
	if (!browser) return Promise.resolve(null);

	scannerPromise ??= (async () => {
		try {
			const { Scanner } = await import('scanic');
			const scanner = new Scanner();
			await scanner.initialize();
			return scanner;
		} catch {
			// No overlay, no cropping — capture falls back to the raw frame.
			return null;
		}
	})();

	return scannerPromise;
}

/**
 * Find the document quad in `source`, in `source`'s own pixel space.
 * Returns `null` when scanic is unavailable, nothing was found, or the quad
 * is too small/degenerate to be a real document.
 */
export async function detectCorners(source: HTMLCanvasElement): Promise<CornerPoints | null> {
	const scanner = await getScanner();
	if (!scanner) return null;

	try {
		const result = await scanner.scan(source);
		if (!result.success || !result.corners) return null;
		if (!isPlausibleQuad(result.corners, source.width, source.height)) return null;
		return result.corners;
	} catch {
		return null;
	}
}

/**
 * Perspective-correct `source` to a flat rectangle using `corners`.
 * Returns `null` on any failure so callers can keep the original frame.
 */
export async function dewarp(
	source: HTMLCanvasElement | HTMLImageElement,
	corners: CornerPoints
): Promise<HTMLCanvasElement | null> {
	if (!browser) return null;

	try {
		const { extractDocument } = await import('scanic');
		const result = await extractDocument(source, corners, { output: 'canvas' });
		const output = result.output;
		return output instanceof HTMLCanvasElement ? output : null;
	} catch {
		return null;
	}
}

// --- Pure geometry ---------------------------------------------------------
// No scanic import: these are unit-testable in the node test project.

const CORNER_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;

/** Corners in draw order (TL → TR → BR → BL). */
export function cornerList(corners: CornerPoints): Point[] {
	return CORNER_KEYS.map((key) => corners[key]);
}

/** Map corners from one pixel space into another (e.g. preview → full res). */
export function scaleCorners(corners: CornerPoints, sx: number, sy: number): CornerPoints {
	return {
		topLeft: { x: corners.topLeft.x * sx, y: corners.topLeft.y * sy },
		topRight: { x: corners.topRight.x * sx, y: corners.topRight.y * sy },
		bottomRight: { x: corners.bottomRight.x * sx, y: corners.bottomRight.y * sy },
		bottomLeft: { x: corners.bottomLeft.x * sx, y: corners.bottomLeft.y * sy }
	};
}

/** The identity quad — the whole frame. Used as the "use original" reset. */
export function fullFrameCorners(width: number, height: number): CornerPoints {
	return {
		topLeft: { x: 0, y: 0 },
		topRight: { x: width, y: 0 },
		bottomRight: { x: width, y: height },
		bottomLeft: { x: 0, y: height }
	};
}

/**
 * Where `object-contain` actually paints a natW×natH source inside a boxW×boxH
 * element. The overlay must use this rather than the element box: if any
 * ancestor constrains the stage's height, the video letterboxes and a quad
 * mapped to the raw box is drawn visibly offset.
 */
export function containFit(
	natW: number,
	natH: number,
	boxW: number,
	boxH: number
): { scale: number; offsetX: number; offsetY: number; drawW: number; drawH: number } {
	if (natW <= 0 || natH <= 0) return { scale: 0, offsetX: 0, offsetY: 0, drawW: 0, drawH: 0 };
	const scale = Math.min(boxW / natW, boxH / natH);
	const drawW = natW * scale;
	const drawH = natH * scale;
	return { scale, offsetX: (boxW - drawW) / 2, offsetY: (boxH - drawH) / 2, drawW, drawH };
}

/** Shoelace area of the quad, in square pixels. */
export function quadArea(corners: CornerPoints): number {
	const pts = cornerList(corners);
	let sum = 0;
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		sum += a.x * b.y - b.x * a.y;
	}
	return Math.abs(sum) / 2;
}

/**
 * Reject detections too small to be the document the user is aiming at —
 * usually a logo, a photo on the page, or a stray high-contrast rectangle.
 */
export function isPlausibleQuad(
	corners: CornerPoints,
	width: number,
	height: number,
	minCoverage = 0.1
): boolean {
	const frame = width * height;
	if (frame <= 0) return false;
	const pts = cornerList(corners);
	if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
	return quadArea(corners) / frame >= minCoverage;
}
