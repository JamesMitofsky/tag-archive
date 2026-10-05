/**
 * Colour maths for building and checking the sky palette (the palette
 * generator and the tests — the runtime engine carries its own copy of the
 * OKLab → sRGB step, see ./engine). OKLab is Björn Ottosson's perceptual space;
 * luminance and contrast follow WCAG 2.
 */
import type { Lab } from './engine';

export type Rgb = [number, number, number];

const decode = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const encode = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** `#rrggbb` → sRGB channels in 0–1. */
export function hexToRgb(hex: string): Rgb {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** sRGB channels in 0–1 → `#rrggbb` (clamped). */
export function rgbToHex(rgb: Rgb): string {
	return (
		'#' +
		rgb
			.map((c) =>
				Math.round(Math.min(1, Math.max(0, c)) * 255)
					.toString(16)
					.padStart(2, '0')
			)
			.join('')
	);
}

/** OKLab → linear-light sRGB (may fall outside 0–1 when out of gamut). */
export function labToLinear([L, a, b]: Lab): Rgb {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
}

/** sRGB (0–1, gamma-encoded) → OKLab. */
export function rgbToLab(rgb: Rgb): Lab {
	const [r, g, b] = rgb.map(decode);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

export const labToHex = (lab: Lab) => rgbToHex(labToLinear(lab).map(encode) as Rgb);
export const hexToLab = (hex: string) => rgbToLab(hexToRgb(hex));

/** Is this colour displayable in sRGB? */
export function inGamut(lab: Lab, epsilon = 1e-4): boolean {
	return labToLinear(lab).every((c) => c >= -epsilon && c <= 1 + epsilon);
}

/** OKLab ↔ polar OKLCH (hue in degrees). */
export function toLch([L, a, b]: Lab): [number, number, number] {
	return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}
export function fromLch(L: number, C: number, h: number): Lab {
	const r = (h * Math.PI) / 180;
	return [L, C * Math.cos(r), C * Math.sin(r)];
}

/** Reduce chroma (keeping lightness and hue) until the colour is in sRGB. */
export function clampToGamut(lab: Lab): Lab {
	if (inGamut(lab)) return lab;
	const [L, C, h] = toLch(lab);
	let lo = 0;
	let hi = C;
	for (let i = 0; i < 30; i++) {
		const mid = (lo + hi) / 2;
		if (inGamut(fromLch(L, mid, h))) lo = mid;
		else hi = mid;
	}
	return fromLch(L, lo, h);
}

/** WCAG 2 relative luminance of a displayable OKLab colour. */
export function luminance(lab: Lab): number {
	const [r, g, b] = labToLinear(clampToGamut(lab)).map((c) => Math.min(1, Math.max(0, c)));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two luminances. */
export function contrast(y1: number, y2: number): number {
	return (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);
}
