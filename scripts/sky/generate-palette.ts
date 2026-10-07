/**
 * Generates src/lib/sky/palette.ts — the sky's keyframes by solar elevation.
 *
 *   pnpm exec tsx scripts/sky/generate-palette.ts
 *
 * Hue comes from physics, lightness from design, legibility from a floor:
 *
 * 1. HUE. Horizon's single-scattering atmosphere model (./horizon.ts) renders
 *    the sky at each keyframe elevation, auto-exposed so even a sun below the
 *    horizon yields readable hues. That is where the golden hour's orange
 *    horizon and civil twilight's rose glow come from.
 * 2. BRAND. Blues are rotated and desaturated so the midday zenith lands on the
 *    site's watercolour-paper blue (BRAND); warm hues are left alone. With the
 *    sun high, the whole gradient is held to that blue (DAYLIGHT) — physics
 *    would put a beige band at the horizon all day, which isn't this site —
 *    and the warmth comes through only as the sun gets low.
 * 3. BLUE HOUR. Single scattering has no answer once the sun is ~9° down (and
 *    exaggerates the pink before that — real twilight zeniths are blue), so each
 *    stop blends toward an indigo night as the sun sinks: the zenith first, the
 *    horizon glow last.
 * 4. LIGHTNESS follows designed curves per stop rather than physics, which
 *    would go black.
 * 5. FLOOR. Every stop keeps at least MIN_CONTRAST against the ink the
 *    handwriting and text are drawn in, raising lightness where needed — so
 *    night is a dusky blue, never dark enough to swallow the drawings.
 *
 * Alongside the colours: cloud cover and starlight by elevation, and the
 * glow's shape (GLOW), which the engine uses to centre each stop's colour on
 * the sun's place on the screen.
 *
 * Re-run after changing any constant here; the output is committed so palette
 * changes show up as reviewable diffs, and the runtime never ray-marches.
 */
import { writeFileSync } from 'node:fs';
import { renderStops } from './horizon';
import {
	clampToGamut,
	contrast,
	fromLch,
	hexToLab,
	luminance,
	rgbToLab,
	toLch,
	type Rgb
} from '../../src/lib/sky/color';
import type { Lab } from '../../src/lib/sky/engine';

/** The site's daytime sky, which the midday zenith must match. */
const BRAND = '#94cae7';
/** The ink of the handwritten drawings and body text. */
const INK = '#14120f';
/** WCAG AA for text — the drawings are images of text. */
const MIN_CONTRAST = 4.5;
/** The indigo the sky settles into after dusk. */
const NIGHT = { hue: 272, chroma: 0.06 };

/** Keyframe elevations (degrees): dense where the colour moves fastest. */
const ELEVATIONS = [
	-90, -18, -12, -10, -8, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4.5, 6, 8, 10, 14, 20, 30, 90
];
/** Gradient stops, top to bottom of the screen (zenith-ward → horizon). */
const POSITIONS = [0, 0.6, 1];

/** Piecewise-linear curve through [elevation, value] points. */
type Curve = [number, number][];
const at = (curve: Curve, e: number): number => {
	if (e <= curve[0][0]) return curve[0][1];
	for (let i = 1; i < curve.length; i++) {
		const [e1, v1] = curve[i];
		const [e0, v0] = curve[i - 1];
		if (e <= e1) return v0 + ((v1 - v0) * (e - e0)) / (e1 - e0);
	}
	return curve[curve.length - 1][1];
};

const brand = toLch(hexToLab(BRAND));

/** Designed OKLab lightness per stop. Dawn and dusk dim the zenith first. */
const LIGHTNESS: Curve[] = [
	[
		[-6, 0.6],
		[-3, 0.62],
		[0, 0.68],
		[3, 0.74],
		[8, 0.79],
		[20, brand[0]]
	],
	[
		[-8, 0.62],
		[-3, 0.68],
		[0, 0.74],
		[3, 0.79],
		[8, 0.83],
		[20, 0.85]
	],
	[
		[-10, 0.64],
		[-4, 0.68],
		[0, 0.75],
		[3, 0.8],
		[8, 0.85],
		[20, 0.88]
	]
];
/** How far each stop has gone over to night (0 → 1) as the sun sinks. */
const NIGHTFALL: Curve[] = [
	[
		[-6, 1],
		[0, 0]
	],
	[
		[-8, 1],
		[-2, 0]
	],
	[
		[-10, 1],
		[-4, 0]
	]
];
/** How much each stop is held to the brand blue (1 → 0) as the sun gets low. */
const DAYLIGHT: Curve = [
	[4, 0],
	[15, 1]
];
/** Brand-blue chroma per stop when held to it: paler toward the horizon. */
const DAYLIGHT_CHROMA = [brand[1], 0.06, 0.045];
/** Cloud-layer opacity: full by day, faint at night. */
const CLOUDS: Curve = [
	[-10, 0.5],
	[-2, 1]
];
/** How much of each star's own brightness shows, as a real sky's stars come
    out: the first few late in civil twilight, most by the end of nautical
    twilight (−12°), all by full night (−18°). */
const STARS: Curve = [
	[-18, 1],
	[-12, 0.7],
	[-7, 0.15],
	[-4, 0]
];
/** How the colour spreads round the sun's place on the screen (see
    src/lib/sky/engine.ts): each stop is drawn as a glow of `stops` colours out
    from the sun, as light as the sky would be with the sun up to `spread`
    degrees higher (at the sun) or lower (in the farthest corner), the turn
    between the two sharpened by `sharpness`. */
const GLOW = { stops: 17, spread: 4, sharpness: 1.5 };

/** Horizon's stops at elevation `e`, auto-exposed so the brightest reaches L 0.75. */
function physicalStops(e: number): Lab[] {
	const rad = (e * Math.PI) / 180;
	const brightest = (exposure: number) =>
		Math.max(...renderStops(rad, exposure).map((s) => rgbToLab(s.rgb as Rgb)[0]));
	let lo = 0.01;
	let hi = 1e8;
	for (let i = 0; i < 60; i++) {
		const mid = Math.sqrt(lo * hi);
		if (brightest(mid) < 0.75) lo = mid;
		else hi = mid;
	}
	const stops = renderStops(rad, lo);
	return POSITIONS.map((p) => {
		const x = p * (stops.length - 1);
		const i = Math.min(stops.length - 2, Math.floor(x));
		const t = x - i;
		const rgb = stops[i].rgb.map((c, k) => c + (stops[i + 1].rgb[k] - c) * t) as Rgb;
		return rgbToLab(rgb);
	});
}

// Rotate blues onto the brand hue and soften them to its chroma, leaving warm
// hues untouched: `blueness` is 1 at the physical midday zenith's hue and falls
// to 0 a quarter-turn away.
const daylight = toLch(physicalStops(40)[0]);
const blueness = (hue: number) => Math.max(0, Math.cos(((hue - daylight[2]) * Math.PI) / 180)) ** 2;
const toBrand = ([, C, h]: [number, number, number]): [number, number] => {
	const w = blueness(h);
	return [C * (1 - (1 - brand[1] / daylight[1]) * w), h + (brand[2] - daylight[2]) * w];
};

const inkY = luminance(hexToLab(INK));

/** Raise lightness (keeping hue, trimming chroma to gamut) until the floor holds. */
function floored(lab: Lab): Lab {
	let colour = clampToGamut(lab);
	while (contrast(luminance(colour), inkY) < MIN_CONTRAST) {
		colour = clampToGamut([colour[0] + 0.002, colour[1], colour[2]]);
	}
	return colour;
}

const round = (n: number, places = 4) => Number(n.toFixed(places));

const stops: Lab[][] = ELEVATIONS.map((e) => {
	// Single scattering returns nothing useful below ~−9°: borrow −8°'s hues
	// there (they are fully blended into night by then anyway).
	const physical = physicalStops(Math.max(e, -8));
	return physical.map((lab, k) => {
		const [C, h] = toBrand(toLch(lab));
		const physicalDay = fromLch(0, C, h);
		const held = fromLch(0, DAYLIGHT_CHROMA[k], brand[2]);
		const d = at(DAYLIGHT, e);
		const day = [
			0,
			physicalDay[1] + (held[1] - physicalDay[1]) * d,
			physicalDay[2] + (held[2] - physicalDay[2]) * d
		];
		const night = fromLch(0, NIGHT.chroma, NIGHT.hue);
		const w = at(NIGHTFALL[k], e);
		const L = at(LIGHTNESS[k], e);
		const blended: Lab = [L, day[1] + (night[1] - day[1]) * w, day[2] + (night[2] - day[2]) * w];
		return floored(blended).map((v) => round(v)) as Lab;
	});
});

const palette = {
	elevations: ELEVATIONS,
	positions: POSITIONS,
	stops,
	clouds: ELEVATIONS.map((e) => round(at(CLOUDS, e), 3)),
	stars: ELEVATIONS.map((e) => round(at(STARS, e), 3)),
	glow: GLOW
};

const out = `// GENERATED by scripts/sky/generate-palette.ts — do not edit by hand; change
// the generator's constants and re-run it. See that file for how the colours
// are derived (Horizon's atmosphere model for hue, designed lightness, an ink
// contrast floor).
import type { SkyPalette } from './engine';

export const SKY_PALETTE: SkyPalette = ${JSON.stringify(palette)};
`;
writeFileSync(new URL('../../src/lib/sky/palette.ts', import.meta.url), out);
console.log(`Wrote ${ELEVATIONS.length} keyframes to src/lib/sky/palette.ts`);
