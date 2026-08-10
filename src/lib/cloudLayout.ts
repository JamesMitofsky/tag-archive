/**
 * Geometry for the floating-page search cloud.
 *
 * Pure functions, no DOM: `CardCloud.svelte` measures the page and owns the
 * animation, this module owns the maths. Split out because the geometry is the
 * part that must not silently regress on desktop, and the only part that is
 * cheaply testable (see `cloudLayout.spec.ts`).
 *
 * Everything is in PIXELS against a measured field box. The previous version
 * worked in `vmin` with a hardcoded `ASPECT = 1.9` x-stretch, which is a
 * landscape assumption: on a portrait phone `vmin` is the WIDTH, so the stretch
 * pushed cards sideways off the screen. Here the cloud is an ellipse the shape
 * of its field, so portrait fields produce portrait clouds for free.
 */

/** A4 (210:297) — every card is a sheet of paper. */
export const A4 = 297 / 210;

/** 12rem: the desktop card width, and the ceiling everywhere. */
const CARD_MAX = 192;
/** 7rem: legibility floor. Only binds below ~330px of field width. */
const CARD_MIN = 112;
/** Card width as a share of field width. */
const CARD_W_FRAC = 0.34;
/** Card height ceiling as a share of field height. Binds on landscape phones. */
const CARD_H_FRAC = 0.62;
/** Minimum clearance between a card's box and the field edge. */
const GUTTER = 8;
/**
 * How much of a half-card may hang off the field edge. Calibrated to reproduce
 * the old layout's outer reach at 1440x900 (650px vs 684px in x). Applied only
 * when the field IS the viewport — a field that stops below the searchbar must
 * not bleed back up into it, and a phone should not clip cards at all.
 */
const BLEED = 0.35;
/** Clearance carved around the searchbar. X is generous: it is what the old
 *  `ASPECT = 1.9` was really expressing — a wide, bar-shaped hole. */
const HOLE_PAD_X = 104;
const HOLE_PAD_Y = 16;
/**
 * Total card area as a multiple of placeable area — the density dial.
 *
 * When the bar is surrounded, the pile-up IS the design: the archive reads as a
 * collage of overlapping paper, and a hovering pointer can pull any buried card
 * forward. 1.15 is calibrated so 1440x900 yields exactly 24, the count the old
 * hardcoded constant produced.
 *
 * Only the surround layout needs this: the stacked layout tiles into a grid, so
 * its density is set by the column count, not by an area budget.
 */
const OCCUPANCY_SURROUND = 1.15;
const CAP_MIN = 3;
const CAP_MAX = 24;
/** Organic jitter as a fraction of each axis' reach (was a flat ±4vmin). */
const JITTER_FRAC = 0.03;

/**
 * Stacked (phone) layout: a two-column grid that scrolls, rather than a cloud
 * squeezed into one screenful. The cards keep their drift and fly-in, but they
 * tile instead of scattering, so nothing is buried and the result count is no
 * longer bounded by what fits above the fold.
 *
 * PAD and GAP must match the Tailwind utilities on the grid in CardCloud
 * (`p-4`, `gap-4`), because the card width is derived from them.
 */
const GRID_COLS = 2;
const GRID_PAD = 16;
const GRID_GAP = 16;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const clamp = (min: number, v: number, max: number) => Math.max(min, Math.min(max, v));

export interface FieldInput {
	/** Placement box, in px. */
	fieldW: number;
	fieldH: number;
	/**
	 * True when the field is the whole viewport and the searchbar sits in the
	 * middle of it, so the cloud needs a hole. False when the field is the strip
	 * below (or above) a bar that has been pushed to one end — then it is a
	 * plain disc and `bar*` is ignored.
	 */
	fullViewport: boolean;
	/** Searchbar block size, used to carve the hole. */
	barW: number;
	barH: number;
}

export interface CloudLayout {
	/**
	 * `surround` scatters cards in an annulus around a centred searchbar.
	 * `grid` tiles them into scrolling columns under a top-anchored one.
	 */
	mode: 'surround' | 'grid';
	/** Columns, in `grid` mode. */
	cols: number;
	cardW: number;
	cardH: number;
	/** How many cards fit at desktop density. */
	cap: number;
	/** Half-extent of the placement ellipse on each axis. */
	availX: number;
	availY: number;
	/** Half-extent of the hole, 0 when there isn't one. */
	holeA: number;
	holeB: number;
}

export interface Placed<T> {
	item: T;
	/** Offset from the field's centre, in px. */
	dx: number;
	dy: number;
	/** Where this card flies out to when dismissed, in px. */
	offX: number;
	offY: number;
	enterStyle: string;
	style: string;
}

/**
 * Deterministic PRNG so a given item always lands and drifts the same way,
 * stable across reactive re-renders.
 */
function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Well-mixed hash of an integer to [0, 1). Used where a value must be
 * INDEPENDENT of the per-card PRNG stream — drawing the fly-in height from that
 * stream tied it to column parity, so every left card came from below and every
 * right card from above.
 */
function hash01(x: number): number {
	let h = x | 0;
	h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
	h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
	return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Per-card ambient drift (translate ±rem, rotate ±deg, timing) as CSS vars. */
function driftStyle(rnd: () => number): string {
	const ddx = (rnd() * 1.4 - 0.7).toFixed(2);
	const ddy = (rnd() * 1.4 - 0.7).toFixed(2);
	const rot = (rnd() * 4 - 2).toFixed(2);
	const dur = (6 + rnd() * 5).toFixed(2);
	const delay = (rnd() * 3).toFixed(2);
	return `--ddx:${ddx}rem;--ddy:${ddy}rem;--rot:${rot}deg;--dur:${dur}s;--delay:${delay}s`;
}

/** Card size and how many of them the field can hold. */
export function measureCloud(f: FieldInput): CloudLayout {
	const { fieldW, fieldH, fullViewport, barW, barH } = f;

	// Stacked: tile into scrolling columns. The card width is whatever makes two
	// of them exactly fill the row, so the grid's CSS and this maths agree by
	// construction. There is no cap — the page scrolls, so every match is shown.
	if (!fullViewport) {
		const gridCardW = Math.max(
			CARD_MIN,
			(fieldW - 2 * GRID_PAD - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS
		);
		return {
			mode: 'grid',
			cols: GRID_COLS,
			cardW: gridCardW,
			cardH: gridCardW * A4,
			cap: Number.POSITIVE_INFINITY,
			availX: 0,
			availY: 0,
			holeA: 0,
			holeB: 0
		};
	}

	const cardW = clamp(
		CARD_MIN,
		Math.min(fieldW * CARD_W_FRAC, (fieldH * CARD_H_FRAC) / A4),
		CARD_MAX
	);
	const cardH = cardW * A4;

	// Bleeding off the edge is a desktop flourish (the collage runs past the
	// window). A field bounded by the searchbar must stay strictly inside it.
	const bleed = fullViewport ? BLEED : 0;
	const availX = Math.max(1, fieldW / 2 - (cardW / 2) * (1 - bleed) - GUTTER);
	const availY = Math.max(1, fieldH / 2 - (cardH / 2) * (1 - bleed) - GUTTER);

	const holeA = fullViewport ? barW / 2 + cardW / 2 + HOLE_PAD_X : 0;
	const holeB = fullViewport ? barH / 2 + cardH / 2 + HOLE_PAD_Y : 0;

	// Area the cards' BOXES can cover: the placement ellipse grown by a half-card
	// on each axis, less the hole shrunk by the same.
	const outer = Math.PI * (availX + cardW / 2) * (availY + cardH / 2);
	const inner = Math.PI * Math.max(0, holeA - cardW / 2) * Math.max(0, holeB - cardH / 2);
	const cap = clamp(
		CAP_MIN,
		Math.round((OCCUPANCY_SURROUND * (outer - inner)) / (cardW * cardH)),
		CAP_MAX
	);

	return { mode: 'surround', cols: 1, cardW, cardH, cap, availX, availY, holeA, holeB };
}

/**
 * Spread items evenly over the field with a phyllotaxis (golden-angle) spiral,
 * inside a bar-shaped hole when there is one.
 *
 * Position comes from each item's RANK among the current matches (ranked by id,
 * so it is deterministic). When the match set changes, survivors glide to their
 * new even slot rather than snapping — even spacing without jarring jumps.
 */
export function placeCloud<T extends { id: number }>(
	items: T[],
	f: FieldInput,
	layout: CloudLayout
): Placed<T>[] {
	const n = items.length;
	const { availX, availY, holeA, holeB } = layout;

	// Grid: CSS owns the position, so this only supplies the motion — each card
	// flies in from the side its column faces, and drifts in place afterwards.
	if (layout.mode === 'grid') {
		return items.map((item, idx) => {
			const rnd = mulberry32(item.id * 2654435761 + 1);
			const towardsLeft = idx % layout.cols === 0;
			const offX = (towardsLeft ? -1 : 1) * (0.6 + rnd() * 0.4) * f.fieldW;
			// Vertical origin is spread wide and signed, so cards arrive from high
			// above and far below rather than all drifting up from one band. Hashed
			// separately from `rnd` so that it stays independent of the column, which
			// decides the horizontal direction.
			const vy = hash01(item.id * 0x9e3779b1 + 0x165667b1) * 2 - 1;
			const offY = Math.sign(vy || 1) * (0.25 + Math.abs(vy) * 0.75) * f.fieldH;
			// Cascade down the rows, plus a per-card offset so that the two cards in a
			// row don't land in lockstep. Capped because only the first couple of
			// screens are visible on arrival — beyond that the delay is wasted.
			const row = Math.floor(idx / layout.cols);
			const enterDelay = (Math.min(row, 14) * 0.06 + rnd() * 0.18).toFixed(2);
			return {
				item,
				dx: 0,
				dy: 0,
				offX,
				offY,
				enterStyle: `--ex:${offX.toFixed(0)}px;--ey:${offY.toFixed(0)}px;--edelay:${enterDelay}s`,
				style: driftStyle(rnd)
			};
		});
	}

	// The hole in normalised field space, so it can be interpolated per-direction.
	const hx = availX > 0 ? holeA / availX : 0;
	const hy = availY > 0 ? holeB / availY : 0;
	const hasHole = hx > 0 && hy > 0;

	// Stable ranks: order indices by item id.
	const rankOf: number[] = [];
	items
		.map((it, idx) => ({ id: it.id, idx }))
		.sort((x, y) => x.id - y.id)
		.forEach((e, rank) => (rankOf[e.idx] = rank));

	return items.map((item, idx) => {
		const rnd = mulberry32(item.id * 2654435761 + 1);
		const k = rankOf[idx];
		const theta = k * GOLDEN_ANGLE;

		// Normalised radius of the hole's rim in THIS direction. The old code used
		// one scalar inner radius times a global x-stretch, which on a portrait
		// tablet flung cards off the sides instead of stacking them above and
		// below the bar.
		const rh = hasHole
			? Math.min(0.95, 1 / Math.hypot(Math.cos(theta) / hx, Math.sin(theta) / hy))
			: 0;

		// Equal-area fill of the annulus between the rim and the edge.
		const rNorm = n > 1 ? (k + 0.5) / n : 0.5;
		const t = Math.sqrt(rh * rh + rNorm * (1 - rh * rh));

		const dx = availX * (t * Math.cos(theta) + (rnd() - 0.5) * 2 * JITTER_FRAC);
		const dy = availY * (t * Math.sin(theta) + (rnd() - 0.5) * 2 * JITTER_FRAC);

		// Fly in from, and out to, whichever edge the card faces — scaled to the
		// field, so a phone doesn't fling a card four screen-widths away.
		const offX = Math.sign(dx || 1) * (0.6 + rnd() * 0.4) * f.fieldW;
		const offY = Math.sign(dy || 1) * (0.55 + rnd() * 0.45) * f.fieldH;
		const enterDelay = (Math.min(k, 12) * 0.05).toFixed(2); // staggered cascade
		const enterStyle = `--ex:${offX.toFixed(0)}px;--ey:${offY.toFixed(0)}px;--edelay:${enterDelay}s`;

		return { item, dx, dy, offX, offY, enterStyle, style: driftStyle(rnd) };
	});
}
