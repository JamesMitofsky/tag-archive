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
	/**
	 * Where it goes instead when the whole cloud is put away, when that is a
	 * particular place rather than off-screen (see `spillFrom`). Offset from the
	 * card's own position, like `offX`/`offY`.
	 */
	homeX?: number;
	homeY?: number;
	/** Flies the card in from `offX`/`offY`: any arrival, as a rule. */
	enterStyle: string;
	/**
	 * Replaces `enterStyle` for the cloud's FIRST arrival only, when that comes
	 * from somewhere other than off-screen (see `spillFrom`). A card rejoining
	 * later, after a neighbor it scattered for is closed, comes back from where
	 * it scattered to, which is `enterStyle`.
	 */
	arrivalStyle?: string;
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
export function cardMargin(cardW: number, cardH: number, tiltDeg = 0): { x: number; y: number } {
	// `tiltDeg` is a standing tilt the card is drawn at (the live board's), on
	// top of which the drift rotates it ROT_DEG further either way.
	const rad = ((ROT_DEG + tiltDeg) * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const sweptW = cardW * cos + cardH * sin;
	const sweptH = cardH * cos + cardW * sin;
	return {
		x: sweptW / 2 + DRIFT_REM * REM_PX + EDGE_PAD,
		y: sweptH / 2 + DRIFT_REM * REM_PX + EDGE_PAD
	};
}

/**
 * Card size and how many of them the field can hold.
 *
 * `fit` asks for room for exactly that many cards rather than for as many as
 * look good: an opened packet must show everything it holds, so instead of
 * capping the count, the cards shrink (never below the legibility floor) until
 * the free area carries them all at the usual density. Past the floor they
 * overlap more, which the hover-to-front stacking already copes with.
 */
export function measureCloud(f: FieldInput, fit?: number): CloudLayout {
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

	if (fit === undefined) {
		const at = surroundAt(f, cardW);
		return { ...at, cap: clamp(CAP_MIN, at.room, CAP_MAX) };
	}

	// Shrink in coarse steps: a few pixels of card width are invisible, and each
	// step costs a pass over the lattice.
	for (let w = cardW; ; w = Math.max(CARD_MIN, w - FIT_STEP)) {
		const at = surroundAt(f, w);
		if (at.room >= fit || w === CARD_MIN) return { ...at, cap: Math.max(0, fit) };
	}
}

/** Shrink step when fitting a given count (see `measureCloud`). */
const FIT_STEP = 8;

/** The live board's card height ceiling, as a share of field height. */
const BOARD_H_FRAC = 0.62;
/** The live board's card width ceiling, as a share of field width. */
const BOARD_W_FRAC = 0.5;
/**
 * Air between two of the live board's pages, beyond the room each one's drift
 * and tilt already take. The board's pages never overlap (see `measureBoard`),
 * and this keeps them from looking as if they touch.
 */
const BOARD_GAP = 12;
/**
 * The most a board page leans, either way, as it stands; the drift tilts it
 * ROT_DEG more. Pages squared to the window read as documents filed in a
 * grid, and a lean is most of what makes them read as sheets adrift instead.
 */
export const BOARD_TILT_DEG = 3;
/**
 * The smallest a board page is drawn, as a share of full size, so that some
 * sit further back than others. Spacing is worked out at full size, so a
 * smaller page only ever has more room around it.
 */
const BOARD_SCALE_MIN = 0.86;
/**
 * How much more room than touching distance the board's size reserves for
 * each page. Sized for exactly touching, the only arrangement that fits is a
 * grid, which reads as rows of documents; this spare room is what lets the
 * pages scatter instead.
 */
const BOARD_SLACK = 1.2;
/** Random candidates weighed for each page's place (see `scatterSlots`). */
const SCATTER_CANDIDATES = 24;
/** Scatters tried before falling back to the spread that always fits. */
const SCATTER_TRIES = 8;

/** A place on the live board: a centre offset, and how the page stands there. */
export interface BoardSlot {
	x: number;
	y: number;
	/** Standing lean, in degrees (within ±BOARD_TILT_DEG). */
	tilt: number;
	/** Drawn size, as a share of full size (BOARD_SCALE_MIN to 1). */
	scale: number;
}

/** A board page's swept half-size: its box at full size, tilted and drifting. */
function boardMargin(cardW: number, cardH: number) {
	return cardMargin(cardW, cardH, BOARD_TILT_DEG);
}

/** Every place a board page may stand, and how far apart two must be. */
function boardSpace(f: FieldInput, cardW: number) {
	const cardH = cardW * A4;
	const m = boardMargin(cardW, cardH);
	const availX = Math.max(1, f.fieldW / 2 - m.x);
	const availY = Math.max(1, f.fieldH / 2 - m.y);
	const free = freeSlots(f, cardW, cardH, availX, availY, m);
	// Two pages clear each other when their swept boxes (lean, drift and tilt
	// included, the edge pad not) are apart on either axis, with the gap between.
	const apartX = 2 * (m.x - EDGE_PAD) + BOARD_GAP;
	const apartY = 2 * (m.y - EDGE_PAD) + BOARD_GAP;
	return { cardH, availX, availY, free, apartX, apartY };
}

/**
 * The live board (/keeper/live): the surround layout with no searchbar to
 * surround, sized for exactly `count` cards that never overlap. Unlike the
 * search cloud, whose pile-up is the design, the board's pages are there to be
 * read from across a room, so none may cover another, even while drifting.
 *
 * It starts from cards as large as the window allows and shrinks them until
 * `count` of them can stand apart with BOARD_SLACK to spare, so the board's few
 * pages come out large, and still loose enough to scatter (`boardSlots`). The
 * size depends on `count`, never on how many are showing, so a page does not
 * change size when another arrives. The board is always a single screenful: it
 * never switches to the scrolling grid. In a window too small to hold `count`
 * apart even at the legibility floor, `cap` says how many it can.
 */
export function measureBoard(f: FieldInput, count: number): CloudLayout {
	const ceiling = Math.max(
		CARD_MIN,
		Math.min(f.fieldW * BOARD_W_FRAC, (f.fieldH * BOARD_H_FRAC) / A4)
	);
	for (let w = ceiling; ; w = Math.max(CARD_MIN, w - FIT_STEP)) {
		const { cardH, availX, availY, free, apartX, apartY } = boardSpace(f, w);
		const roomy = separatedSlots(free, count, apartX * BOARD_SLACK, apartY * BOARD_SLACK);
		if (roomy.length >= count || w === CARD_MIN) {
			const fits = Math.min(count, separatedSlots(free, count, apartX, apartY).length);
			return { mode: 'surround', cols: 1, cardW: w, cardH, cap: fits, availX, availY };
		}
	}
}

/**
 * Where the live board's `n` cards stand, numbered in the order they are
 * filled (see `assignSlots` in #lib/live), no two close enough to overlap. The
 * places are scattered by `seed` (`scatterSlots`), each with a lean and a depth
 * of its own, so the board reads as pages adrift rather than as rows. The same
 * window and seed give the same places, so the board keeps its picture while
 * open; a new seed (a new opening) deals a new one. Fewer than `n` when the
 * window cannot hold them all apart.
 */
export function boardSlots(
	f: FieldInput,
	layout: CloudLayout,
	n: number,
	seed: number
): BoardSlot[] {
	const { free, apartX, apartY } = boardSpace(f, layout.cardW);
	const rnd = mulberry32(seed * 2654435761 + 7);
	let places: { x: number; y: number }[] = [];
	for (let t = 0; t < SCATTER_TRIES && places.length < n; t++) {
		places = scatterSlots(free, n, apartX, apartY, rnd);
	}
	// The sizing guarantees this spread fits, so it stands in when every
	// scatter happened to paint itself into a corner.
	if (places.length < n) places = separatedSlots(free, n, apartX, apartY);
	return places.map((p) => ({
		...p,
		tilt: (rnd() * 2 - 1) * BOARD_TILT_DEG,
		scale: BOARD_SCALE_MIN + rnd() * (1 - BOARD_SCALE_MIN)
	}));
}

/**
 * How far apart two places are for the board's purposes: the larger of the two
 * axes' gaps, each in units of the distance at which two pages stop
 * overlapping on that axis. 1 or more means the pages clear each other.
 */
function apartness(apartX: number, apartY: number) {
	return (a: { x: number; y: number }, b: { x: number; y: number }) =>
		Math.max(Math.abs(a.x - b.x) / apartX, Math.abs(a.y - b.y) / apartY);
}

/**
 * Scattered places, no two closer than `apart` (see `separatedSlots` for the
 * measure): each one is the best of a few random free positions, the one
 * furthest from those already taken (Mitchell's best-candidate sampling). That
 * keeps the pages spread across the window without the order of a grid. Fewer
 * than `n` when the positions it happened to choose leave no room for the
 * rest; the caller tries again.
 */
function scatterSlots(
	slots: { x: number; y: number }[],
	n: number,
	apartX: number,
	apartY: number,
	rnd: () => number
): { x: number; y: number }[] {
	const distance = apartness(apartX, apartY);
	const near = new Array<number>(slots.length).fill(Number.POSITIVE_INFINITY);
	const picked: { x: number; y: number }[] = [];
	while (picked.length < n) {
		const open: number[] = [];
		for (let j = 0; j < slots.length; j++) if (near[j] >= 1) open.push(j);
		if (open.length === 0) break;
		let best = open[Math.floor(rnd() * open.length)];
		for (let c = 1; c < SCATTER_CANDIDATES; c++) {
			const j = open[Math.floor(rnd() * open.length)];
			if (near[j] > near[best]) best = j;
		}
		const chosen = slots[best];
		picked.push(chosen);
		near[best] = -1; // taken
		for (let j = 0; j < slots.length; j++) {
			if (near[j] >= 0) near[j] = Math.min(near[j], distance(slots[j], chosen));
		}
	}
	return picked;
}

/**
 * `pickSlots` with a guarantee: no two picks are closer than `apartX` on the x
 * axis AND closer than `apartY` on the y axis, which is when two boxes of that
 * size would overlap. Distance is measured in those units, as the larger of the
 * two axes' shares (so a pick 1 or more away clears every other), and each pick
 * is the free position furthest from all those before it, starting from the
 * deepest corner. Deterministic, and as tight a packing as this greedy finds,
 * so it is what decides whether a size fits; but it lines pages up in rows,
 * which is why the board scatters them instead (`scatterSlots`). Stops early,
 * with fewer than `n`, when no position is left that clears every pick.
 */
function separatedSlots(
	slots: { x: number; y: number }[],
	n: number,
	apartX: number,
	apartY: number
): { x: number; y: number }[] {
	if (slots.length === 0 || n <= 0) return [];
	const distance = apartness(apartX, apartY);

	let best = 0;
	for (let j = 1; j < slots.length; j++) {
		const a = slots[j];
		const b = slots[best];
		if (a.x * a.x + a.y * a.y > b.x * b.x + b.y * b.y) best = j;
	}

	const picked: { x: number; y: number }[] = [];
	const near = new Array<number>(slots.length).fill(Number.POSITIVE_INFINITY);

	while (picked.length < n && near[best] >= 1) {
		const chosen = slots[best];
		picked.push(chosen);
		near[best] = -1; // taken
		for (let j = 0; j < slots.length; j++) {
			if (near[j] >= 0) near[j] = Math.min(near[j], distance(slots[j], chosen));
		}
		best = 0;
		for (let j = 1; j < slots.length; j++) if (near[j] > near[best]) best = j;
	}
	return picked;
}

/** The surround layout at a given card width, with its uncapped room. */
function surroundAt(f: FieldInput, cardW: number) {
	const cardH = cardW * A4;

	// Reach of a card's CENTRE, so that its swept box still lands inside the field.
	const margin = cardMargin(cardW, cardH);
	const availX = Math.max(1, f.fieldW / 2 - margin.x);
	const availY = Math.max(1, f.fieldH / 2 - margin.y);

	// How many cards the free part of the window can carry. Free area is measured
	// the same way the placement measures it — by counting lattice slots a card
	// can legally stand on — so the count and the placement can never disagree.
	const slots = freeSlots(f, cardW, cardH, availX, availY);
	const freeArea = slots.length * SLOT_STEP * SLOT_STEP;
	const room = Math.round((OCCUPANCY_SURROUND * freeArea) / (cardW * cardH));

	return { mode: 'surround' as const, cols: 1, cardW, cardH, availX, availY, room };
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
function freeSlots(
	f: FieldInput,
	cardW: number,
	cardH: number,
	availX: number,
	availY: number,
	margin = cardMargin(cardW, cardH)
) {
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
		const k = rankOf[idx];
		return placeAt(item, slots[k] ?? { x: 0, y: 0 }, f, item.id, k);
	});
}

/**
 * One card of the surround layout, standing at `at`. Its motion (where it flies
 * from and to, and how it drifts) is drawn from `seed`, which is the card's own
 * id as a rule; `pinAt` passes another one to keep a card looking the same while
 * it changes identity.
 */
function placeAt<T>(
	item: T,
	at: { x: number; y: number },
	f: FieldInput,
	seed: number,
	rank: number
): Placed<T> {
	const rnd = mulberry32(seed * 2654435761 + 1);
	const dx = at.x;
	const dy = at.y;

	// Fly in from, and out to, whichever edge the card faces — scaled to the
	// field, so a phone doesn't fling a card four screen-widths away.
	const offX = Math.sign(dx || 1) * (0.6 + rnd() * 0.4) * f.fieldW;
	const offY = Math.sign(dy || 1) * (0.55 + rnd() * 0.45) * f.fieldH;
	const enterDelay = (Math.min(rank, 12) * 0.05).toFixed(2); // staggered cascade
	const enterStyle = `--ex:${offX.toFixed(0)}px;--ey:${offY.toFixed(0)}px;--edelay:${enterDelay}s`;

	return { item, dx, dy, offX, offY, enterStyle, style: driftStyle(rnd) };
}

/**
 * A surround card held at a given spot rather than given a slot: an open
 * packet's face, which stays exactly where the packet stood (see CardCloud).
 *
 * `seed` is the id of the card it stands in for, and it decides the drift, so
 * that a card taking over another's element carries on the very same float:
 * swapping drift parameters mid-animation would make it jump.
 */
export function pinAt<T>(
	item: T,
	at: { x: number; y: number },
	f: FieldInput,
	seed: number
): Placed<T> {
	return placeAt(item, at, f, seed, 0);
}

/**
 * The box a card centred at `at` sweeps as it drifts and tilts, in viewport
 * coordinates: a no-go zone that keeps the rest of a cloud off a pinned card.
 * Only meaningful for the surround layout, where the field is the viewport.
 */
export function sweptRect(
	f: FieldInput,
	at: { x: number; y: number },
	cardW: number,
	cardH: number
): Rect {
	const m = cardMargin(cardW, cardH);
	const halfX = m.x - EDGE_PAD;
	const halfY = m.y - EDGE_PAD;
	return {
		left: f.fieldW / 2 + at.x - halfX,
		top: f.fieldH / 2 + at.y - halfY,
		width: 2 * halfX,
		height: 2 * halfY
	};
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

/** Gap between successive cards leaving a packet, in seconds. */
const SPILL_STAGGER = 0.025;
/** Cards after this many all leave together, so a full packet doesn't dawdle. */
const SPILL_STAGGER_MAX = 24;

/**
 * A placed cloud re-aimed at one point, for a packet opening: every card flies
 * in FROM `origin` rather than from off-screen, so the packet's contents spill
 * out of it across the sky, and `homeX`/`homeY` send each one back INTO it when
 * the packet is put away. `origin` is a centre offset, like a card's `dx`/`dy`.
 *
 * Nothing fades on the way. The cards are coming out from under the packet's
 * face, which stays put (see CardCloud), so they are fully there the whole time:
 * hidden while they are behind it, and seen as they clear its edge. A card
 * fading in would read as one materialising beside the packet instead
 * (`--eo` is the opacity the entrance starts from).
 *
 * The spill goes in `arrivalStyle`, not `enterStyle`. It describes the moment
 * the packet opens and nothing after it: a card that scatters off-screen while a
 * neighbor is open (`offX`/`offY`, left alone here) has to come back from that
 * same edge, or it would be seen leaving one way and returning from the middle.
 */
export function spillFrom<T>(placed: Placed<T>[], origin: { x: number; y: number }): Placed<T>[] {
	return placed.map((p, k) => {
		const homeX = origin.x - p.dx;
		const homeY = origin.y - p.dy;
		const delay = (Math.min(k, SPILL_STAGGER_MAX) * SPILL_STAGGER).toFixed(3);
		return {
			...p,
			homeX,
			homeY,
			arrivalStyle: `--ex:${homeX.toFixed(0)}px;--ey:${homeY.toFixed(0)}px;--edelay:${delay}s;--eo:1`
		};
	});
}
