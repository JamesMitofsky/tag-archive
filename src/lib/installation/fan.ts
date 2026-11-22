/**
 * An image set in the Archive Stream floats as a small pile of prints, as it
 * does on /images (see #lib/components/ImageStack): its first photograph on
 * top, two more turned a few degrees either way beneath it. Drawn into the
 * lens, the pile fans out, and every photograph of the set comes out from
 * under the top one to lie beside it, in the set's own order, left to right,
 * along a gentle arc. Out of the lens, the prints slide back under the top one.
 *
 * Pure: this decides where each print lies, piled and fanned, and the
 * projector page eases between the two with a single number (see `--fan`).
 *
 * Everything is a share of the pile's box, which has the first photograph's
 * shape: x of its width, y of its height. So the layout holds at whatever size
 * the set is drawn.
 */

/** The most prints a fan lays out. Any past these stay out of it. */
export const MAX_FANNED = 18;
/** How many prints the closed pile shows: the top one and two beneath. */
export const PILED = 3;

/** The most prints in a row of the fan before it takes another row. */
const PER_ROW = 6;
/** The share of a print its neighbor covers, as a fanned hand of prints overlaps. */
const OVERLAP = 0.12;
/** The gap between rows, as a share of the taller row's height. */
const ROW_GAP = 0.1;
/** How far a row's ends dip below its middle, as a share of its height. */
const ARC = 0.16;
/** How far a row's end prints turn, following its arc (degrees). */
const TILT = 7;
/** The share of the fan each next print waits before it moves, all told. */
const STAGGER = 0.3;
/**
 * The share of its box the closed pile takes, so the turned prints' corners
 * stay near it, as ImageStack insets its pile.
 */
const PILE_INSET = 0.9;

/**
 * How each print lies in the closed pile, the top one first: the two beneath
 * turned opposite ways, a little smaller and off center, so their corners show
 * on both sides. The same poses as ImageStack's.
 */
const POSES = [
	{ x: 0, y: 0, rotate: 0, scale: 1 },
	{ x: -0.03, y: 0.015, rotate: -6, scale: 0.94 },
	{ x: 0.04, y: -0.02, rotate: 5, scale: 0.9 }
];
/** Any print deeper than the poses lies square under the top one, out of sight. */
const HIDDEN = { x: 0, y: 0, rotate: 0, scale: 0.9 };

export type Pose = {
	/** The print's center, offset from the box's center: shares of its width and height. */
	x: number;
	y: number;
	/** Degrees, clockwise. */
	rotate: number;
	/** Of the print's own size (`w`, `h`). */
	scale: number;
};

export type FanPrint = {
	/** The print's size when fanned, as shares of the box's width and height. */
	w: number;
	h: number;
	pile: Pose;
	/** Fanned, every print is drawn at its own size (scale 1). */
	fan: Omit<Pose, 'scale'>;
	/**
	 * When it moves: from `delay` of the way into the fan, over `span` of it, so
	 * the prints come out one after another rather than all at once.
	 */
	delay: number;
	span: number;
};

export type Fan = {
	/** Top first. */
	prints: FanPrint[];
	/** The fanned prints' bounds, as multiples of the box's width and height. Never below 1. */
	width: number;
	height: number;
};

/** Half the bounds of a `w` by `h` rectangle turned `degrees`. */
function extents(w: number, h: number, degrees: number) {
	const theta = (degrees * Math.PI) / 180;
	const cos = Math.abs(Math.cos(theta));
	const sin = Math.abs(Math.sin(theta));
	return { x: (w * cos + h * sin) / 2, y: (w * sin + h * cos) / 2 };
}

/**
 * Where each print of a set lies, piled and fanned, given the photographs'
 * shapes (width over height) in the set's order. The box has the first one's
 * shape. Fanned, every print has the same area as the box, so prints of
 * either orientation weigh the same, and the top one keeps its size.
 */
export function layoutFan(aspects: readonly number[]): Fan {
	const shapes = aspects.slice(0, MAX_FANNED).map((a) => (a > 0 && Number.isFinite(a) ? a : 1));
	const n = shapes.length;
	if (n === 0) return { prints: [], width: 1, height: 1 };
	// A lone print has nothing to fan out from under it.
	if (n === 1) {
		const still = { x: 0, y: 0, rotate: 0 };
		return {
			prints: [{ w: 1, h: 1, pile: { ...still, scale: 1 }, fan: still, delay: 0, span: 1 }],
			width: 1,
			height: 1
		};
	}
	const box = shapes[0];

	// Worked in units of the box's height, so turning a print keeps its shape;
	// a box is `box` wide in these units.
	const sizes = shapes.map((a) => ({ w: Math.sqrt(box * a), h: Math.sqrt(box / a) }));

	// The rows, about equally long, in order.
	const rowCount = Math.ceil(n / PER_ROW);
	const perRow = Math.ceil(n / rowCount);
	const rows: number[][] = [];
	for (let k = 0; k < n; k += perRow) {
		rows.push(Array.from({ length: Math.min(perRow, n - k) }, (_, j) => k + j));
	}

	// Each row's prints side by side, each overlapping the one before, then
	// bent along an arc whose ends dip and turn outward.
	const fanned: Omit<Pose, 'scale'>[] = new Array(n);
	const rowHeights = rows.map((row) => Math.max(...row.map((k) => sizes[k].h)) * (1 + ARC));
	const total =
		rowHeights.reduce((sum, h) => sum + h, 0) +
		ROW_GAP * Math.max(...rowHeights) * (rows.length - 1);
	let top = -total / 2;
	rows.forEach((row, r) => {
		const centers: number[] = [];
		let x = 0;
		row.forEach((k, j) => {
			if (j > 0) x += ((sizes[row[j - 1]].w + sizes[k].w) / 2) * (1 - OVERLAP);
			centers.push(x);
		});
		const half = x / 2;
		const rowH = rowHeights[r] / (1 + ARC);
		const middle = top + rowHeights[r] / 2;
		row.forEach((k, j) => {
			const cx = centers[j] - half;
			const t = half > 0 ? cx / half : 0;
			fanned[k] = {
				x: cx,
				// Centered on the arc's own height: its middle sits high, its ends low.
				y: middle + ARC * rowH * (t * t - 0.5),
				rotate: TILT * t
			};
		});
		top += rowHeights[r] + ROW_GAP * Math.max(...rowHeights);
	});

	let halfW = box / 2;
	let halfH = 0.5;
	for (let k = 0; k < n; k++) {
		const e = extents(sizes[k].w, sizes[k].h, fanned[k].rotate);
		halfW = Math.max(halfW, Math.abs(fanned[k].x) + e.x);
		halfH = Math.max(halfH, Math.abs(fanned[k].y) + e.y);
	}

	const prints = sizes.map(({ w, h }, k): FanPrint => {
		const pose = POSES[k] ?? HIDDEN;
		// Piled, each print is fitted inside the box, as ImageStack fits them.
		const fit = Math.min(box / w, 1 / h);
		return {
			w: w / box,
			h,
			pile: { x: pose.x, y: pose.y, rotate: pose.rotate, scale: fit * pose.scale * PILE_INSET },
			fan: { x: fanned[k].x / box, y: fanned[k].y, rotate: fanned[k].rotate },
			delay: (k / (n - 1)) * STAGGER,
			span: 1 - STAGGER
		};
	});
	return { prints, width: (2 * halfW) / box, height: 2 * halfH };
}

/** The fan's bounds `fan` of the way open, as multiples of the box. */
export function fanBounds(layout: Pick<Fan, 'width' | 'height'>, fan: number) {
	return { width: 1 + (layout.width - 1) * fan, height: 1 + (layout.height - 1) * fan };
}
