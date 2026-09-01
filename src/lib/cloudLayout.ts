/**
 * Geometry for the floating-page search cloud.
 *
 * Pure functions, no DOM: `CardCloud.svelte` measures the page and owns the
 * animation, this module owns the maths. Split out because the geometry is the
 * part that must not silently regress on desktop, and the only part that is
 * cheaply testable (see `cloudLayout.spec.ts`).
 *
 * Everything is in PIXELS against a measured field box, with the origin at the
 * field's centre.
 *
 * The surround layout is a SUBTRACTIVE one: a card may stand anywhere on screen
 * except where it would be cropped by the window or would cover a piece of fixed
 * chrome (the searchbar, the nav, the home mark). Those no-go zones arrive as
 * measured rectangles, so the layout does not have to know what any of them are,
 * and adding another one later is a `data-cloud-block` attribute rather than a
 * new constant here.
 *
 * It replaces a radial ring (a golden-angle spiral in a superellipse annulus).
 * A ring is a shape the cards must fit into, and a rectangular window is not
 * that shape: the corners went unused however boxy the ring's exponent was, and
 * on a narrow window the ring's band collapsed to nothing. Subtracting zones
 * from the whole window uses every part of it that is genuinely free.
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
/**
 * Clearance between a card and the things it must not touch: the window edge,
 * and each no-go zone. Deliberately tiny — these are boundaries to respect, not
 * margins to design with, and anything larger reads as an empty frame around the
 * collage rather than as paper filling the sky.
 */
const EDGE_PAD = 2;
const ZONE_PAD = 6;
/**
 * Ambient drift, and the slack the placement has to reserve for it.
 *
 * A card is laid out at its resting position and then animated ±DRIFT_REM and
 * ±ROT_DEG by the `float` keyframes in CardCloud. Placement therefore cannot
 * budget for the card's static box — it must budget for the box the card sweeps
 * out, or a card resting flush against the edge drifts over it. These are the
 * source of truth: `driftStyle` below emits them, the CSS just interpolates.
 */
const DRIFT_REM = 0.7;
const ROT_DEG = 2;
/** `float` translates in rem, but the field is measured in px. */
const REM_PX = 16;
/**
 * Total card area as a multiple of the free area — the density dial.
 *
 * Above 1 by design: the free area counts where a card's CENTRE may stand, which
 * shrinks much faster than the window does once cards are large, and the collage
 * is meant to overlap anyway.
 *
 * When the bar is surrounded, the pile-up IS the design: the archive reads as a
 * collage of overlapping paper, and a hovering pointer can pull any buried card
 * forward. Only the surround layout needs this: the stacked layout tiles into a
 * grid, so its density is set by the column count, not by an area budget.
 */
const OCCUPANCY_SURROUND = 2.8;
/**
 * Spacing of the lattice of candidate positions. Finer than this buys nothing
 * visible — cards are an order of magnitude bigger — and the search below is
 * linear in the candidate count.
 */
const SLOT_STEP = 16;
/** Card-count floor and ceiling. Exported so the tests assert against the dial
 *  rather than a copy of its value, which drifts every time it is tuned. */
export const CAP_MIN = 3;
export const CAP_MAX = 26;
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
	/**
	 * Fixed chrome no card may sit under, in VIEWPORT coordinates (what
	 * `getBoundingClientRect` returns): the searchbar, the nav, the home mark.
	 * Measured rather than declared, so the layout never has to be told what the
	 * chrome is or where the design moved it to.
	 */
	blocks?: Rect[];
}

/** A no-go rectangle, in viewport coordinates. */
export interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
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
	/** How far a card's CENTRE may sit from the field centre on each axis before
	 *  its drifting box would cross the window edge. */
	availX: number;
	availY: number;
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
	const ddx = (rnd() * 2 * DRIFT_REM - DRIFT_REM).toFixed(2);
	const ddy = (rnd() * 2 * DRIFT_REM - DRIFT_REM).toFixed(2);
	const rot = (rnd() * 2 * ROT_DEG - ROT_DEG).toFixed(2);
	const dur = (6 + rnd() * 5).toFixed(2);
	const delay = (rnd() * 3).toFixed(2);
	return `--ddx:${ddx}rem;--ddy:${ddy}rem;--rot:${rot}deg;--dur:${dur}s;--delay:${delay}s`;
}

/**
 * Half-size of the box a drifting card actually sweeps out: its own box rotated
 * by ROT_DEG (a tilted rectangle is wider AND taller than an upright one), plus
 * the drift translation, plus the (deliberately tiny) edge pad.
 *
 * This is what keeps cards fully on screen. Letting a card hang off the edge
 * costs more than it looks: a page cropped by the window stops reading as a
 * sheet of paper floating in front of the sky and starts reading as a panel
 * pinned to the frame, which is the one thing this layout is trying not to be.
 */
export function cardMargin(cardW: number, cardH: number): { x: number; y: number } {
	const rad = (ROT_DEG * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const sweptW = cardW * cos + cardH * sin;
	const sweptH = cardH * cos + cardW * sin;
	return {
		x: sweptW / 2 + DRIFT_REM * REM_PX + EDGE_PAD,
		y: sweptH / 2 + DRIFT_REM * REM_PX + EDGE_PAD
	};
}

/** Card size and how many of them the field can hold. */
export function measureCloud(f: FieldInput): CloudLayout {
	const { fieldW, fieldH, fullViewport } = f;

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
			availY: 0
		};
	}

	const cardW = clamp(
		CARD_MIN,
		Math.min(fieldW * CARD_W_FRAC, (fieldH * CARD_H_FRAC) / A4),
		CARD_MAX
	);
	const cardH = cardW * A4;

	// Reach of a card's CENTRE, so that its swept box still lands inside the field.
	const margin = cardMargin(cardW, cardH);
	const availX = Math.max(1, fieldW / 2 - margin.x);
	const availY = Math.max(1, fieldH / 2 - margin.y);

	// How many cards the free part of the window can carry. Free area is measured
	// the same way the placement measures it — by counting lattice slots a card
	// can legally stand on — so the count and the placement can never disagree.
	const slots = freeSlots(f, cardW, cardH, availX, availY);
	const freeArea = slots.length * SLOT_STEP * SLOT_STEP;
	const cap = clamp(
		CAP_MIN,
		Math.round((OCCUPANCY_SURROUND * freeArea) / (cardW * cardH)),
		CAP_MAX
	);

	return { mode: 'surround', cols: 1, cardW, cardH, cap, availX, availY };
}

/**
 * Every lattice position a card may legally stand on: fully inside the window,
 * and clear of every no-go zone. Returned as centre offsets from the field's
 * centre.
 *
 * Zones are tested against the box the card SWEEPS (drift and tilt included),
 * not its resting box, so a card that clears the nav at rest cannot drift up
 * into it a second later.
 */
function freeSlots(f: FieldInput, cardW: number, cardH: number, availX: number, availY: number) {
	const margin = cardMargin(cardW, cardH);
	// Zone tests use the swept half-size without the edge pad, which is an
	// edge-of-window allowance and has nothing to say about the chrome.
	const halfX = margin.x - EDGE_PAD + ZONE_PAD;
	const halfY = margin.y - EDGE_PAD + ZONE_PAD;

	// Zones in field coordinates (centre-origin), pre-inflated by the card's half
	// size: a card centre inside the inflated rectangle is a card overlapping it.
	const forbidden = (f.blocks ?? []).map((b) => ({
		x0: b.left - f.fieldW / 2 - halfX,
		x1: b.left + b.width - f.fieldW / 2 + halfX,
		y0: b.top - f.fieldH / 2 - halfY,
		y1: b.top + b.height - f.fieldH / 2 + halfY
	}));

	const out: { x: number; y: number }[] = [];
	const nx = Math.max(1, Math.floor((2 * availX) / SLOT_STEP));
	const ny = Math.max(1, Math.floor((2 * availY) / SLOT_STEP));
	for (let i = 0; i <= nx; i++) {
		const x = -availX + (i * 2 * availX) / nx;
		for (let j = 0; j <= ny; j++) {
			const y = -availY + (j * 2 * availY) / ny;
			if (forbidden.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)) continue;
			out.push({ x, y });
		}
	}
	return out;
}

/**
 * Spread items over whatever the window leaves free, corner-first.
 *
 * Slots are chosen by farthest-point sampling: take the free position furthest
 * from the field's centre (a corner, always), then repeatedly take the one
 * furthest from everything chosen so far. That fills the extremities before the
 * middle, which is what makes the collage look like it is holding up the edges
 * of the window rather than huddling around the searchbar, and it needs no
 * notion of a ring — the free region can be any shape the chrome leaves behind.
 *
 * Position comes from each item's RANK among the current matches (ranked by id,
 * so it is deterministic). When the match set changes, survivors glide to their
 * new slot rather than snapping.
 */
export function placeCloud<T extends { id: number }>(
	items: T[],
	f: FieldInput,
	layout: CloudLayout
): Placed<T>[] {
	const n = items.length;
	const { availX, availY } = layout;

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

	// Stable ranks: order indices by item id.
	const rankOf: number[] = [];
	items
		.map((it, idx) => ({ id: it.id, idx }))
		.sort((x, y) => x.id - y.id)
		.forEach((e, rank) => (rankOf[e.idx] = rank));

	const slots = pickSlots(freeSlots(f, layout.cardW, layout.cardH, availX, availY), n);

	return items.map((item, idx) => {
		const rnd = mulberry32(item.id * 2654435761 + 1);
		const k = rankOf[idx];
		const slot = slots[k] ?? { x: 0, y: 0 };
		const dx = slot.x;
		const dy = slot.y;

		// Fly in from, and out to, whichever edge the card faces — scaled to the
		// field, so a phone doesn't fling a card four screen-widths away.
		const offX = Math.sign(dx || 1) * (0.6 + rnd() * 0.4) * f.fieldW;
		const offY = Math.sign(dy || 1) * (0.55 + rnd() * 0.45) * f.fieldH;
		const enterDelay = (Math.min(k, 12) * 0.05).toFixed(2); // staggered cascade
		const enterStyle = `--ex:${offX.toFixed(0)}px;--ey:${offY.toFixed(0)}px;--edelay:${enterDelay}s`;

		return { item, dx, dy, offX, offY, enterStyle, style: driftStyle(rnd) };
	});
}

/**
 * Farthest-point sampling: `n` slots spread as widely as the free region allows.
 *
 * The first pick is the slot furthest from the centre rather than an arbitrary
 * one, so the layout starts in a corner and stays deterministic; each later pick
 * maximises its distance to everything already taken. Ties resolve to the first
 * candidate in lattice order, which is why the result never depends on any
 * random seed — the same window and the same chrome give the same cloud.
 */
function pickSlots(slots: { x: number; y: number }[], n: number): { x: number; y: number }[] {
	if (slots.length === 0 || n <= 0) return [];

	// Seed: the slot furthest from the centre — the deepest free corner.
	let best = 0;
	for (let j = 1; j < slots.length; j++) {
		const a = slots[j];
		const b = slots[best];
		if (a.x * a.x + a.y * a.y > b.x * b.x + b.y * b.y) best = j;
	}

	const picked: { x: number; y: number }[] = [];
	/** Squared distance from each slot to the nearest one already picked. */
	const near = new Array<number>(slots.length).fill(Number.POSITIVE_INFINITY);

	while (picked.length < n) {
		const chosen = slots[best];
		picked.push(chosen);
		near[best] = -1; // never pick the same slot twice
		for (let j = 0; j < slots.length; j++) {
			if (near[j] < 0) continue;
			const dx = slots[j].x - chosen.x;
			const dy = slots[j].y - chosen.y;
			near[j] = Math.min(near[j], dx * dx + dy * dy);
		}
		best = 0;
		for (let j = 1; j < slots.length; j++) if (near[j] > near[best]) best = j;
		// Fewer free positions than cards (a tiny window): stop rather than pile the
		// remainder on one slot. The caller's `cap` is derived from the same slot
		// count, so this is a backstop, not a normal path.
		if (near[best] < 0) break;
	}
	return picked;
}
