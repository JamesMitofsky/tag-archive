#!/usr/bin/env node
/**
 * Convert a hand-drawn stroke capture into an SVG asset.
 *
 * Input JSON shape (as exported by the drawing tool):
 *   { "id": string, "name": string, "tuples": [ [ [x, y, t, pressure], ... ], ... ] }
 * where each entry of `tuples` is one stroke and each tuple is one sampled point.
 *
 * Output is a vector SVG so the mark stays crisp at any size / device pixel
 * ratio — unlike the raster export, which is captured at roughly 2x the drawing
 * surface and blurs when scaled up.
 *
 * Usage:
 *   node scripts/strokes-to-svg.mjs <input.json> [output.svg]
 *
 * Convention: keep the stroke JSON next to the SVG it produced
 * (e.g. static/drawing/icons/hamburger.svg + hamburger.strokes.json) so the
 * editable source travels with the rendered asset.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

/** Ink colour sampled from the existing handwritten assets. */
const INK = '#0d0b0a';
/** Nib width in drawing-surface units (~1.5, measured off the raster export). */
const STROKE_WIDTH = 1.5;
/** Breathing room around the ink so round caps are never clipped. */
const PADDING = STROKE_WIDTH;

/** Minimum gap (drawing units) between kept samples — the capture oversamples. */
const MIN_POINT_GAP = 0.75;

const round = (n) => Number(n.toFixed(2));

/**
 * Drop samples closer than MIN_POINT_GAP to the previously kept one. The
 * pointer stream records a point per frame even when the pen barely moves, so
 * most of the raw tuples collapse to identical coordinates.
 */
function thin(points) {
	const kept = [points[0]];
	for (const point of points.slice(1)) {
		const [px, py] = kept[kept.length - 1];
		if (Math.hypot(point[0] - px, point[1] - py) >= MIN_POINT_GAP) kept.push(point);
	}
	// Always keep the true end point so the stroke does not finish short.
	const last = points[points.length - 1];
	if (kept[kept.length - 1] !== last) kept.push(last);
	return kept;
}

/**
 * Smooth a sampled stroke into a path: a quadratic segment per point, each
 * anchored at the midpoint between neighbours. Removes the sampling jitter
 * that a raw polyline would show while staying faithful to the drawn line.
 */
function strokeToPath(points) {
	if (points.length === 1) {
		// A tap: zero-length segment, drawn as a dot by the round linecap.
		const [x, y] = points[0];
		return `M${round(x)} ${round(y)}l0 0`;
	}

	const [first, ...rest] = points;
	let d = `M${round(first[0])} ${round(first[1])}`;

	for (let i = 0; i < rest.length - 1; i++) {
		const [cx, cy] = rest[i];
		const [nx, ny] = rest[i + 1];
		d += `Q${round(cx)} ${round(cy)} ${round((cx + nx) / 2)} ${round((cy + ny) / 2)}`;
	}

	const last = rest[rest.length - 1];
	d += `L${round(last[0])} ${round(last[1])}`;
	return d;
}

const [inputPath, outputArg] = process.argv.slice(2);
if (!inputPath) {
	console.error('Usage: node scripts/strokes-to-svg.mjs <input.json> [output.svg]');
	process.exit(1);
}
const outputPath = outputArg ?? inputPath.replace(/(\.strokes)?\.json$/, '.svg');

const source = JSON.parse(readFileSync(inputPath, 'utf8'));
const strokes = (source.tuples ?? []).filter((stroke) => stroke.length > 0).map(thin);
if (strokes.length === 0) {
	console.error(`No strokes found in ${inputPath}`);
	process.exit(1);
}

const points = strokes.flat();
const minX = Math.min(...points.map((p) => p[0]));
const maxX = Math.max(...points.map((p) => p[0]));
const minY = Math.min(...points.map((p) => p[1]));
const maxY = Math.max(...points.map((p) => p[1]));

// Translate the capture to the origin so the viewBox starts at 0 0.
const shifted = strokes.map((stroke) =>
	stroke.map(([x, y]) => [x - minX + PADDING, y - minY + PADDING])
);
const width = round(maxX - minX + PADDING * 2);
const height = round(maxY - minY + PADDING * 2);

const paths = shifted.map((stroke) => `\t<path d="${strokeToPath(stroke)}" />`).join('\n');
const title = source.name ? `\n\t<title>${source.name}</title>` : '';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none" stroke="${INK}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">${title}
${paths}
</svg>
`;

writeFileSync(outputPath, svg);
console.log(
	`${basename(inputPath)} → ${outputPath} (${strokes.length} strokes, ${width}×${height})`
);
