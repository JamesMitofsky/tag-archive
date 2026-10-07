/**
 * The stars behind the night sky: where each one sits, how big and bright it
 * is, and how it twinkles. Fixed for good — placed along a Halton sequence and
 * drawn from a seeded generator — so the server, the client and every reload
 * show the same sky. How much of their light shows at any moment is the
 * palette's (`SkyFrame.stars`), and Sky draws them.
 */

/** One star, fixed in the sky and twinkling. */
export type Star = {
	/** Where its centre sits, as percentages of the sky's width and height. */
	left: number;
	top: number;
	/** Its whole extent, in CSS pixels: a dot's diameter, or a sparkle's span
	    from tip to tip. */
	size: number;
	/** A sparkle, with four rays, rather than a dot. Only the brightest are. */
	sparkle: boolean;
	/** Its opacity at full night, at the peak of its twinkle; the sky's
	    starlight scales it. */
	brightness: number;
	/** Its colour, as `#rrggbb`: stars run from blue-white to pale gold. */
	tint: string;
	/** Seconds one twinkle takes. Each star's differs, so they never pulse in
	    step. */
	twinkle: number;
	/** How far into its twinkle the star is when the sky appears, 0–1. */
	phase: number;
};

/** CSS pixels of sky to each star: the screen shows as many as fit its area
    at this density (`starCount`), so a phone and a desktop show the same sky,
    not the desktop's stars crammed onto the phone. */
const STAR_AREA = 22_000;

/** The most stars any screen shows, enough to fill a large desktop one. */
const STAR_LIMIT = 100;

/** A four-pointed sparkle in a box from -1 to 1 each way, its sides drawn in
    toward the centre so it is all rays. */
export const SPARKLE_PATH =
	'M0-1C.07-.07.07-.07 1 0 .07.07.07.07 0 1-.07.07-.07.07-1 0-.07-.07-.07-.07 0-1Z';

const STAR_TINTS = ['#fffaf0', '#eef3ff', '#fff1dc'] as const;

/** How many of `STARS` a sky `width` by `height` CSS pixels shows: always the
    first ones, which are spread evenly over the sky however many are taken. */
export const starCount = (width: number, height: number) =>
	Math.min(STARS.length, Math.round((width * height) / STAR_AREA));

/* Placed along a Halton sequence, whose every run from the start is spread
   evenly over the square without falling into a grid, so a phone's handful and
   a desktop's hundred are both an even scatter: no clumps, no bare patches.

   Brightness is skewed as a real sky's is: most stars faint, a few bright, and
   only the brightest given rays. And all of them dim toward the horizon, where
   a real sky's stars are seen through more air. */
export const STARS: readonly Star[] = (() => {
	const random = mulberry32(0x5ca77e);
	return Array.from({ length: STAR_LIMIT }, (_, i) => {
		const x = halton(i + 1, 2);
		const y = halton(i + 1, 3);
		const magnitude = random() ** 3;
		const sparkle = magnitude > 0.42;
		const horizon = 1 - 0.55 * y ** 2;
		const tint = random();
		return {
			left: round(x * 100),
			top: round(y * 100),
			size: round(sparkle ? 8 + 10 * magnitude : 1.5 + 2.5 * magnitude),
			sparkle,
			brightness: round((0.5 + 0.5 * magnitude) * horizon),
			tint: STAR_TINTS[tint < 0.6 ? 0 : tint < 0.85 ? 1 : 2],
			twinkle: round(3 + 4 * random()),
			phase: round(random())
		};
	});
})();

/** The `index`th term of the Halton sequence in `base`, in [0, 1). */
function halton(index: number, base: number) {
	let result = 0;
	for (let f = 1 / base, i = index; i > 0; i = Math.floor(i / base)) {
		result += f * (i % base);
		f /= base;
	}
	return result;
}

/** A small seeded generator of numbers in [0, 1). */
function mulberry32(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
	};
}

function round(value: number) {
	return +value.toFixed(2);
}
