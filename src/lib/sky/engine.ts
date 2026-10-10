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
 * The palette gives each elevation one colour, and the screen is painted as
 * a glow round the sun's place on it, as Horizon Time's is. The screen is the
 * sky's dome squashed to fit — east on the right, west on the left, the zenith
 * at the top and the horizon along the bottom — so the sun rises out of the
 * bottom-right corner, arcs up as far as it climbs, and sets into the
 * bottom-left, a set sun sitting just below the frame. At each point the sky
 * is the colour the whole sky would have with the sun a little higher (near
 * the sun) or a little lower (far from it): one radial gradient, centred on
 * the sun, that travels the screen with it. Through a dawn each change of
 * light grows out of the rising sun's corner; through a dusk each comes in
 * from the far side of the screen and reaches the setting sun last. By day and
 * by night none of it shows, since the palette holds either side of its
 * keyframes.
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
	/** Per keyframe: the sky's colour with the sun at that elevation. */
	colours: Lab[];
	/** Per keyframe: cloud-layer opacity. */
	clouds: number[];
	/** Per keyframe: how much of each star's own brightness shows, 0–1. */
	stars: number[];
	/** The glow round the sun: how many colours it is sampled at, out from
	    the sun to the screen's farthest corner; how many degrees of elevation
	    the sky is raised at the sun (and lowered in that corner); and how
	    sharply it turns from one to the other. */
	glow: { stops: number; spread: number; sharpness: number };
};

/** Where the sun sits on the screen, as fractions of its width and height
    (east on the right, the zenith at the top, `y` past 1 for a sun below the
    horizon), and the distance from there to the screen's farthest corner. */
export type SunPlace = { x: number; y: number; reach: number };

/** One rendered moment of the sky. */
export type SkyFrame = {
	/** Solar elevation over DC, degrees. */
	elevation: number;
	/** The sun's place on the screen, which the glow is centred on. */
	sun: SunPlace;
	/** The glow, as OKLab: `glow.stops` colours evenly spaced from the sun's
	    place out to the farthest corner. */
	glow: Lab[];
	/** The same glow as `#rrggbb`. */
	glowHex: string[];
	/** The sky down the middle of the screen, as OKLab, at the top, the
	    middle and the bottom (`MIDLINE`): what the browser chrome and the
	    edges of the page are tinted with. */
	lab: Lab[];
	/** The same colours as `#rrggbb`. */
	hex: string[];
	/** Cloud-layer opacity. */
	clouds: number;
	/** Starlight, 0–1: none by day, all of it by full night. */
	stars: number;
};

/** The sky at instant `ms` (epoch milliseconds) over `lat`/`lon`. */
export function skyFrame(ms: number, palette: SkyPalette, lat: number, lon: number): SkyFrame {
	// Solar position — the low-precision one also used by suncalc (Astronomical
	// Algorithms, ch. 25), good to well under a minute of sunrise time, which is
	// far finer than any colour change it drives.
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
	// Azimuth clockwise from north (suncalc measures it from the south).
	const azimuth =
		Math.atan2(
			Math.sin(hourAngle),
			Math.cos(hourAngle) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)
		) + Math.PI;

	// The sun's place on the screen: as far right as it stands east, the zenith
	// at the top edge and the horizon along the bottom. Its easting is
	// flattened by its height, so a sun passing high overhead, whose azimuth
	// swings round fast, stays near the middle rather than sweeping the screen.
	const x = (1 + Math.sin(azimuth) * Math.cos(elevation * rad)) / 2;
	const y = 1 - elevation / 90;
	const reach = Math.hypot(Math.max(x, 1 - x), Math.max(y, 1 - y));

	// The palette at elevation `e`, interpolated between the two keyframes
	// around it in OKLab, so blue-to-orange blends neither detour through green
	// nor go muddy.
	const es = palette.elevations;
	const tint = (e: number) => {
		let i = 0;
		while (i < es.length - 2 && e > es[i + 1]) i++;
		const t = Math.min(1, Math.max(0, (e - es[i]) / (es[i + 1] - es[i])));
		const mix = (p: number, q: number) => p + (q - p) * t;
		return {
			colour: [0, 1, 2].map((c) => mix(palette.colours[i][c], palette.colours[i + 1][c])) as Lab,
			clouds: mix(palette.clouds[i], palette.clouds[i + 1]),
			stars: mix(palette.stars[i], palette.stars[i + 1])
		};
	};

	// The sky a distance out from the sun, 0 at its place and 1 at the screen's
	// farthest corner: the whole sky's colour with the sun raised near it and
	// lowered far from it, by `spread` at most, the turn between them held
	// toward each end by `sharpness`. Hue moves with the light, so the glow is
	// a colour of its own round the sun, not the same sky made lighter.
	const { stops: count, spread, sharpness } = palette.glow;
	const glowing = (distance: number): Lab =>
		tint(
			elevation +
				(spread * Math.tanh(sharpness * Math.cos(Math.PI * distance))) / Math.tanh(sharpness)
		).colour;
	const glow = Array.from({ length: count }, (_, i) => glowing(i / (count - 1)));
	// Down the middle of the screen: top, middle, bottom.
	const lab = [0, 0.5, 1].map((py) => glowing(Math.hypot(0.5 - x, py - y) / reach));

	// OKLab → sRGB hex (Björn Ottosson's reference matrices).
	const hex = ([l0, a, b]: Lab) => {
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
				.map((c) => {
					const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
					return Math.round(Math.min(1, Math.max(0, v)) * 255)
						.toString(16)
						.padStart(2, '0');
				})
				.join('')
		);
	};

	const { clouds, stars } = tint(elevation);
	return {
		elevation,
		sun: { x, y, reach },
		glow,
		glowHex: glow.map(hex),
		lab,
		hex: lab.map(hex),
		clouds,
		stars
	};
}

/**
 * Paint a frame onto <html> as custom properties: the glow's colours
 * (`--sky-glow-<i>`) and the sun's place it is centred on (`--sky-x`,
 * `--sky-y`, `--sky-reach`), which Sky draws; the sky down the middle of the
 * screen (`--sky-0` top, `--sky-1` middle, `--sky-2` bottom), which tints the
 * page's edges; the clouds' and
 * stars' share of their own opacity; and `sky-starry` while any star shows.
 * Also the browser chrome: `theme-color` tints the iOS status bar / Android
 * toolbar; recent iOS Safari samples the root background instead, which
 * follows `--sky-0` via CSS.
 */
export function paintSky(frame: SkyFrame, root: HTMLElement): void {
	const percent = (fraction: number) => (fraction * 100).toFixed(2) + '%';
	frame.glowHex.forEach((hex, i) => root.style.setProperty('--sky-glow-' + i, hex));
	root.style.setProperty('--sky-x', percent(frame.sun.x));
	root.style.setProperty('--sky-y', percent(frame.sun.y));
	root.style.setProperty('--sky-reach', percent(frame.sun.reach));
	frame.hex.forEach((hex, k) => root.style.setProperty('--sky-' + k, hex));
	root.style.setProperty('--sky-clouds', String(frame.clouds));
	root.style.setProperty('--sky-stars', String(frame.stars));
	root.classList.toggle('sky-starry', frame.stars > 0);
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', frame.hex[0]);
}

/** Points the screen is compared at: a 5 × 5 grid, edges included. */
const GRID = [0, 0.25, 0.5, 0.75, 1];

/** What a change in starlight weighs, per unit, against an OKLab ΔE. Less
    than a bright star stands out from the sky (~0.4), because Sky eases each
    star's opacity from one step to the next: a step of 0.06, the most this
    allows, is a fade of a few hundredths on a point of light, not a jump. */
const STAR_DE = 0.1;

/** The sky a frame paints at a point on the screen (fractions of its width and
    height), as OKLab: the glow at the point's distance from the sun, as Sky
    draws it. */
export function colourAt(frame: SkyFrame, px: number, py: number): Lab {
	const { x, y, reach } = frame.sun;
	const { glow } = frame;
	const at = Math.min(1, Math.hypot(px - x, py - y) / reach) * (glow.length - 1);
	const i = Math.min(glow.length - 2, Math.floor(at));
	const t = at - i;
	return glow[i].map((c, n) => c + (glow[i + 1][n] - c) * t) as Lab;
}

/** Perceptual distance between two frames: the largest OKLab ΔE anywhere on
    the screen, or the change in starlight weighed as one, whichever is more. */
export function frameDistance(a: SkyFrame, b: SkyFrame): number {
	let max = Math.abs(a.stars - b.stars) * STAR_DE;
	for (const px of GRID) {
		for (const py of GRID) {
			const [p, q] = [colourAt(a, px, py), colourAt(b, px, py)];
			max = Math.max(max, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
		}
	}
	return max;
}
