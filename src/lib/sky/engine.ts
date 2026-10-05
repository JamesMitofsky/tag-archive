/**
 * The sky's colour as a function of time: where the sun stands over Washington,
 * DC, and what the sky looks like with the sun there.
 *
 * Everything keys off solar elevation, not clock time. Sunrise and sunset are,
 * by definition, the moments the sun crosses −0.833°, so the colours are
 * centred on them; and twilight lasts exactly as long as it really does on any
 * given day (in DC, +6° → −18° takes ~124 min at the equinoxes, ~159 at the
 * June solstice) with no seasonal tables. The only input is the UTC instant, so
 * daylight saving and the viewer's own timezone never enter into it — every
 * visitor sees the garden's sky.
 *
 * `skyFrame` and `paintSky` are self-contained BY CONTRACT: they are
 * stringified (`fn.toString()`) into the inline <head> script that paints the
 * first frame before the page renders (see ./headScript). They may reference
 * only their parameters and JS built-ins — no imports, no module-level
 * bindings, no helpers defined outside their own bodies.
 */

/** Washington, DC — whose sunrise and sunset the sky follows. */
export const DC = { lat: 38.9072, lon: -77.0369 } as const;

/** An OKLab colour, `[L, a, b]`. */
export type Lab = [number, number, number];

/** Sky keyframes by solar elevation; see ./palette for how they are made. */
export type SkyPalette = {
	/** Keyframe solar elevations in degrees, ascending. */
	elevations: number[];
	/** Per keyframe: gradient stops, zenith first, horizon last. */
	stops: Lab[][];
	/** Gradient stop positions (0–1), shared by every keyframe. */
	positions: number[];
	/** Per keyframe: cloud-layer opacity. */
	clouds: number[];
};

/** One rendered moment of the sky. */
export type SkyFrame = {
	/** Solar elevation over DC, degrees. */
	elevation: number;
	/** Gradient stops as OKLab, zenith first. */
	lab: Lab[];
	/** The same stops as `#rrggbb`. */
	hex: string[];
	/** Cloud-layer opacity. */
	clouds: number;
};

/** The sky at instant `ms` (epoch milliseconds) over `lat`/`lon`. */
export function skyFrame(ms: number, palette: SkyPalette, lat: number, lon: number): SkyFrame {
	// Solar elevation — the low-precision solar position also used by suncalc
	// (Astronomical Algorithms, ch. 25), good to well under a minute of sunrise
	// time, which is far finer than any colour change it drives.
	const rad = Math.PI / 180;
	const d = ms / 86400000 - 10957.5; // days since J2000.0
	const M = rad * (357.5291 + 0.98560028 * d); // solar mean anomaly
	const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
	const L = M + C + rad * 102.9372 + Math.PI; // ecliptic longitude
	const tilt = rad * 23.4397;
	const dec = Math.asin(Math.sin(tilt) * Math.sin(L));
	const ra = Math.atan2(Math.sin(L) * Math.cos(tilt), Math.cos(L));
	const hourAngle = rad * (280.16 + 360.9856235 * d) + rad * lon - ra;
	const phi = rad * lat;
	const elevation =
		Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle)) /
		rad;

	// Interpolate between the two keyframes around that elevation, in OKLab so
	// blue-to-orange blends neither detour through green nor go muddy.
	const es = palette.elevations;
	let i = 0;
	while (i < es.length - 2 && elevation > es[i + 1]) i++;
	const t = Math.min(1, Math.max(0, (elevation - es[i]) / (es[i + 1] - es[i])));
	const mix = (x: number, y: number) => x + (y - x) * t;
	const lab = palette.stops[i].map(
		(from, k) =>
			[0, 1, 2].map((c) => mix(from[c], palette.stops[i + 1][k][c])) as [number, number, number]
	);

	// OKLab → sRGB hex (Björn Ottosson's reference matrices).
	const hex = lab.map(([l0, a, b]) => {
		const l = (l0 + 0.3963377774 * a + 0.2158037573 * b) ** 3;
		const m = (l0 - 0.1055613458 * a - 0.0638541728 * b) ** 3;
		const s = (l0 - 0.0894841775 * a - 1.291485548 * b) ** 3;
		const linear = [
			4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
			-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
			-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
		];
		return (
			'#' +
			linear
				.map((x) => {
					const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
					return Math.round(Math.min(1, Math.max(0, v)) * 255)
						.toString(16)
						.padStart(2, '0');
				})
				.join('')
		);
	});

	return { elevation, lab, hex, clouds: mix(palette.clouds[i], palette.clouds[i + 1]) };
}

/**
 * Paint a frame: the gradient stops, the cloud opacity, and the browser chrome
 * (`theme-color` tints the iOS status bar / Android toolbar; recent iOS Safari
 * samples the root background instead, which follows `--sky-0` via CSS).
 */
export function paintSky(frame: SkyFrame, root: HTMLElement): void {
	frame.hex.forEach((hex, k) => root.style.setProperty('--sky-' + k, hex));
	root.style.setProperty('--sky-clouds', String(frame.clouds));
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', frame.hex[0]);
}

/** Perceptual distance between two frames: the largest OKLab ΔE across their stops. */
export function frameDistance(a: SkyFrame, b: SkyFrame): number {
	let max = 0;
	a.lab.forEach((p, k) => {
		const q = b.lab[k];
		max = Math.max(max, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
	});
	return max;
}
