/**
 * The Archive Stream field: every public artefact page, photograph and event,
 * laid out on a world that wraps at its edges (a torus), so the water never
 * ends and there is no edge to bump into.
 *
 * Things that belong together sit together. An event, its artefacts and its
 * photographs form a cluster; the clusters of each season form an island,
 * labeled at its center with its season ("Winter 2024"); and the islands run
 * in date order through the world. So drifting in one direction is drifting
 * through time, drifting nearby is finding related things, and the bubbles say
 * when you are.
 *
 * Pure and free of the DOM: the projector page draws what this decides.
 * Positions are world pixels. `cam` is the world point at the screen's center.
 */

import type { Vec } from './physics.ts';
import { seasonOf, type Season } from './season.ts';

export type FieldKind = 'artefact' | 'photo' | 'event';

/** What an event card shows beyond its title once it is in focus. */
export type EventDetails = {
	time: string | null;
	/** The source page's own words (see AGENTS.md), shown as they are. */
	description: string | null;
	hosts: string[];
};

export type FieldItem = {
	id: string;
	kind: FieldKind;
	/** The image to show, or null for an event drawn as a card with its title. */
	src: string | null;
	/** Width over height. */
	aspect: number;
	/** A ThumbHash (see #lib/images/placeholder) shown until the image loads. */
	placeholder: string | null;
	/**
	 * Exactly as the archive holds it. A picture shows it under itself when in
	 * focus; an event card bears it.
	 */
	title: string;
	/** A partial date (see #lib/partialDate), or null when undated. */
	date: string | null;
	/** An event's details, null for artefact pages and photographs. */
	details: EventDetails | null;
	/** Items with the same key sit together. */
	cluster: string;
};

export type Placed = {
	item: FieldItem;
	/** The item's center in the world. */
	x: number;
	y: number;
	/** Its size at rest, before any focus. */
	w: number;
	h: number;
	/** Where it is in its slow bob, 0..1. */
	phase: number;
};

/** A season's island, by the place its bubble sits: the island's center. */
export type Group = {
	key: string;
	/** What the bubble says: "Winter 2024", "2019", "Undated". */
	label: string;
	x: number;
	y: number;
};

export type World = {
	width: number;
	height: number;
	/** The side of one layout cell, and so roughly the gap between neighbors. */
	cell: number;
	placed: Placed[];
	/** One per season, in date order. */
	groups: Group[];
};

/** An A4 page, portrait: what an artefact scan with no stored size is drawn as. */
export const A4_ASPECT = 1 / Math.SQRT2;
/** An event with no picture: a small landscape card. */
export const CARD_ASPECT = 1.3;

/** The signed distance from 0 to `d` around a loop of `size`: in [-size/2, size/2]. */
export function wrapDelta(d: number, size: number): number {
	return d - size * Math.round(d / size);
}

/** `p` relative to `cam`, the shortest way around the world. */
export function offsetFrom(cam: Vec, p: Vec, world: Pick<World, 'width' | 'height'>): Vec {
	return { x: wrapDelta(p.x - cam.x, world.width), y: wrapDelta(p.y - cam.y, world.height) };
}

/** A small seeded random source (mulberry32), so the layout is the same every load. */
export function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export type LayoutOptions = {
	/** The projector's size in CSS px: the world is shaped like it. */
	viewW: number;
	viewH: number;
	/** About how many items one screen shows over an island (the water between shows fewer). */
	perScreen?: number;
	/** The share of an island's cells left empty, so the water has room to breathe. */
	emptyShare?: number;
	/** The open water between neighboring islands, in cells. */
	channel?: number;
	seed?: number;
};

/**
 * A cluster's date: its earliest date known at least to the month, else its
 * earliest year-only date, else null. A finer date wins over an earlier coarse
 * one, so an event on 2019-07-04 whose program is filed under "2019" stays
 * in Summer 2019 rather than falling back to the bare year.
 *
 * Lexicographic order on partial dates is chronological order (see
 * #lib/partialDate), so plain string comparison finds the earliest.
 */
function clusterDate(items: readonly FieldItem[]): string | null {
	let fine: string | null = null;
	let coarse: string | null = null;
	for (const { date } of items) {
		if (!date) continue;
		if (date.length >= 7) {
			if (!fine || date < fine) fine = date;
		} else if (!coarse || date < coarse) coarse = date;
	}
	return fine ?? coarse;
}

type Cluster = { date: string | null; first: number; items: FieldItem[] };

/** Clusters in date order, undated ones last, each cluster's items in the order given. */
function orderedClusters(items: readonly FieldItem[]): Cluster[] {
	const clusters = new Map<string, Cluster>();
	items.forEach((item, i) => {
		let cluster = clusters.get(item.cluster);
		if (!cluster) {
			cluster = { date: null, first: i, items: [] };
			clusters.set(item.cluster, cluster);
		}
		cluster.items.push(item);
	});
	for (const cluster of clusters.values()) cluster.date = clusterDate(cluster.items);
	return [...clusters.values()].sort((a, b) => {
		if (a.date === b.date) return a.first - b.first;
		if (a.date === null) return 1;
		if (b.date === null) return -1;
		return a.date < b.date ? -1 : 1;
	});
}

/** Items cluster by cluster, the clusters in date order (see `clusterDate`). */
export function orderByCluster(items: readonly FieldItem[]): FieldItem[] {
	return orderedClusters(items).flatMap((cluster) => cluster.items);
}

export type SeasonGroup = Season & { items: FieldItem[] };

/**
 * The items gathered into seasons (see #lib/installation/season), in date
 * order. A cluster is never split: it joins the season of its date, so an
 * event's photographs sit with it even when one was taken the week after.
 */
export function groupBySeason(items: readonly FieldItem[]): SeasonGroup[] {
	const groups = new Map<string, SeasonGroup>();
	for (const cluster of orderedClusters(items)) {
		const season = seasonOf(cluster.date);
		let group = groups.get(season.key);
		if (!group) {
			group = { ...season, items: [] };
			groups.set(season.key, group);
		}
		group.items.push(...cluster.items);
	}
	return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** A cell of an island, as whole-cell offsets from the island's center. */
type Cell = { i: number; j: number };

/**
 * An island's outline is a superellipse, |x/a|^n + |y/b|^n <= 1: rounder than
 * a rectangle, so it reads as an island, but squarer than an ellipse, so it
 * leaves less of its slot as open water.
 */
const SHAPE = 3;
/**
 * The share of its bounding box an island covers: the superellipse's own
 * share (about 0.88 at SHAPE 3) less what its coastline's inlets take.
 */
const FILL = 0.76;
/** Kept clear at every island's center for its bubble: the label is wider than tall. */
const isBubble = (i: number, j: number) => j === 0 && Math.abs(i) <= 1;
const BUBBLE_CELLS = 3;

/**
 * The cells of an island `w` by `h` cells, with room for at least `needed`
 * items: those within its outline, less the bubble's. The coastline dips in
 * and out (inlets of up to a seventh of the way in), so islands aren't stamped
 * from one mold. When the box is too tight for `needed`, the outline grows a
 * little past it.
 *
 * The cells come in serpentine row order, the top row left to right and the
 * next back again, so neighbors in date order are neighbors in space.
 */
function islandCells(needed: number, w: number, h: number, random: () => number): Cell[] {
	const a = random() * Math.PI * 2;
	const b = random() * Math.PI * 2;
	const shore = (theta: number) =>
		1 - 0.04 * (1 - Math.sin(3 * theta + a)) - 0.03 * (1 - Math.sin(5 * theta + b));
	const outline = (rx: number, ry: number) => {
		const cells: Cell[] = [];
		const reachX = Math.ceil(rx);
		const reachY = Math.ceil(ry);
		for (let j = -reachY; j <= reachY; j++) {
			const row: Cell[] = [];
			for (let i = -reachX; i <= reachX; i++) {
				if (isBubble(i, j)) continue;
				const x = Math.abs(i / rx);
				const y = Math.abs(j / ry);
				const r = (x ** SHAPE + y ** SHAPE) ** (1 / SHAPE);
				if (r <= shore(Math.atan2(y * Math.sign(j), x * Math.sign(i)))) row.push({ i, j });
			}
			if ((j + reachY) % 2 === 1) row.reverse();
			cells.push(...row);
		}
		return cells;
	};
	// Cell centers sit at whole offsets, so a box `w` wide reaches (w - 1) / 2
	// from the center to its outer cells' centers.
	for (let grow = 1; ; grow *= 1.03) {
		const cells = outline(Math.max(1.5, (w - 1) / 2) * grow, Math.max(0.5, (h - 1) / 2) * grow);
		if (cells.length >= needed) return cells;
	}
}

/**
 * Splits `widths`, in order, into at most `rows` runs whose longest is as
 * short as it can be, so the rows come out about equally long.
 */
function balancedRows(widths: readonly number[], rows: number): number[][] {
	const split = (cap: number) => {
		const out: number[][] = [];
		let sum = Infinity;
		widths.forEach((width, index) => {
			if (sum + width > cap) {
				out.push([]);
				sum = 0;
			}
			out[out.length - 1].push(index);
			sum += width;
		});
		return out;
	};
	let low = Math.max(0, ...widths);
	let high = widths.reduce((sum, width) => sum + width, 0);
	for (let step = 0; step < 40 && high - low > 1e-6; step++) {
		const mid = (low + high) / 2;
		if (split(mid).length <= rows) high = mid;
		else low = mid;
	}
	return split(high);
}

/**
 * Lay the items out as islands, one per season, each with its bubble's cells
 * kept clear at its center. Within an island the items sit on a grid of cells
 * in date order; some cells stay empty, and each item is nudged off its cell's
 * center and given its own size, so the result reads as things floating on
 * water rather than as a grid.
 *
 * The islands run in date order along rows of one height, a serpentine again
 * (left to right, then back), so drifting in one direction is drifting
 * through time. A season too big to be round at that height stretches along
 * its row instead, and each row's islands widen to fill the world's width, so
 * the only open water is the channels between islands and around the small
 * ones. The world is shaped like the screen and never smaller than one, so no
 * item can be seen twice at once across the seam.
 */
export function layoutField(items: readonly FieldItem[], options: LayoutOptions): World {
	const { viewW, viewH, perScreen = 37, emptyShare = 0.08, channel = 1, seed = 7 } = options;
	const random = seededRandom(seed);
	const cell = Math.sqrt((viewW * viewH) / perScreen);
	const aspect = viewW / viewH;
	const minCols = viewW / cell + 1;
	const minRows = viewH / cell + 1;

	const islands = groupBySeason(items).map((group) => {
		const needed = Math.ceil(group.items.length / (1 - emptyShare));
		const area = (needed + BUBBLE_CELLS) / FILL;
		// The size of its box when round, and never too small for its bubble.
		return { group, needed, area, round: Math.max(3.5, Math.sqrt(area)) };
	});

	/** An island's box in a row `rowH` cells tall: round if it fits, else stretched along the row. */
	const box = (island: (typeof islands)[number], rowH: number) => {
		const h = Math.min(rowH - channel, island.round);
		return { w: Math.max(island.round === h ? h : 0, island.area / h, 3.5), h };
	};

	// Try a range of row heights. For each, take the number of rows that gives
	// the world the screen's shape, balance the islands across them, and keep
	// whichever leaves the least open water, still near the screen's shape.
	let best: { rowH: number; cols: number; rows: number[][]; score: number } | null = null;
	const tallest = Math.max(4, ...islands.map((island) => island.round + channel));
	for (let rowH = Math.min(4, tallest); rowH <= tallest + 1e-9; rowH += 0.25) {
		const widths = islands.map((island) => box(island, rowH).w + channel);
		const length = widths.reduce((sum, width) => sum + width, 0);
		const target = Math.max(1, Math.round(Math.sqrt(length / (rowH * aspect))));
		for (const count of [target - 1, target, target + 1]) {
			if (count < 1) continue;
			const rows = islands.length ? balancedRows(widths, count) : [];
			const longest = Math.max(0, ...rows.map((row) => row.reduce((sum, k) => sum + widths[k], 0)));
			const cols = Math.max(minCols, longest);
			const height = Math.max(minRows, rows.length * rowH);
			const score = cols * height * (1 + Math.abs(Math.log(cols / height / aspect)));
			if (!best || score < best.score) best = { rowH, cols, rows, score };
		}
	}
	const { cols, rows } = best!;
	const height = Math.max(minRows, rows.length * best!.rowH);
	// A small archive's world is taller than its rows: share the rest between them.
	const rowH = height / Math.max(1, rows.length);

	const placed: Placed[] = [];
	const groups: Group[] = [];
	rows.forEach((row, r) => {
		const boxes = row.map((k) => {
			const b = box(islands[k], best!.rowH);
			// A full-height island takes the row's full height.
			return b.h === best!.rowH - channel ? { w: b.w, h: rowH - channel } : b;
		});
		// Each island widens in step with the others, to fill the row.
		const natural = boxes.reduce((sum, b) => sum + b.w, 0);
		const stretch = (cols - row.length * channel) / natural;
		let x = 0;
		const slots = row.map((k, n) => {
			const w = boxes[n].w * stretch;
			const slot = { island: islands[k], w, h: boxes[n].h, left: x };
			x += w + channel;
			return slot;
		});

		for (const slot of slots) {
			// The serpentine: odd rows run right to left.
			const cx =
				r % 2 === 0
					? slot.left + channel / 2 + slot.w / 2
					: cols - slot.left - channel / 2 - slot.w / 2;
			const cy = r * rowH + rowH / 2;
			const { group, needed } = slot.island;
			const cells = islandCells(needed, slot.w, slot.h, random);
			groups.push({ key: group.key, label: group.label, x: cx * cell, y: cy * cell });

			// Spread the empty cells evenly, with a little randomness, rather than
			// leaving them all at the end of the last row.
			const total = cells.length;
			const empties = total - group.items.length;
			const skip = new Set<number>();
			for (let k = 0; k < empties; k++) {
				skip.add(Math.min(total - 1, Math.floor(((k + random()) * total) / empties)));
			}

			let next = 0;
			for (let index = 0; index < total && next < group.items.length; index++) {
				// Leave a cell empty only while there are still enough cells for the rest.
				if (skip.has(index) && total - index > group.items.length - next) continue;
				const item = group.items[next++];
				const long =
					cell * 0.6 * (0.8 + random() * 0.32) * (item.kind === 'event' && !item.src ? 0.82 : 1);
				// Mirrored on odd rows, so the island's own date order runs with the row.
				const i = r % 2 === 0 ? cells[index].i : -cells[index].i;
				placed.push({
					item,
					x: (cx + i + (random() - 0.5) * 0.44) * cell,
					y: (cy + cells[index].j + (random() - 0.5) * 0.44) * cell,
					w: item.aspect >= 1 ? long : long * item.aspect,
					h: item.aspect >= 1 ? long / item.aspect : long,
					phase: random()
				});
			}
		}
	});

	return { width: cols * cell, height: height * cell, cell, placed, groups };
}

/**
 * The world position of the item nearest `point`, taken the short way round
 * (so it may lie outside the world's bounds, beside `point`), or null when
 * none is within `reach`.
 */
export function nearestItem(world: World, point: Vec, reach = Infinity): Vec | null {
	let best: Vec | null = null;
	let bestDistance = reach;
	for (const p of world.placed) {
		const offset = offsetFrom(point, p, world);
		const distance = Math.hypot(offset.x, offset.y);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = { x: point.x + offset.x, y: point.y + offset.y };
		}
	}
	return best;
}

/**
 * Where the camera belongs in `to`, a fresh layout of some of the same items,
 * so the view stays with what it was on: the item nearest `cam` in `from` that
 * `to` still holds keeps its place on screen. Null when they share no item.
 */
export function carryCamera(from: World, to: World, cam: Vec): Vec | null {
	const kept = new Map(to.placed.map((p) => [p.item.id, p]));
	let best: { offset: Vec; at: Placed } | null = null;
	let bestDistance = Infinity;
	for (const p of from.placed) {
		const at = kept.get(p.item.id);
		if (!at) continue;
		const offset = offsetFrom(cam, p, from);
		const distance = Math.hypot(offset.x, offset.y);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = { offset, at };
		}
	}
	return best ? { x: best.at.x - best.offset.x, y: best.at.y - best.offset.y } : null;
}

/** Hermite smoothstep from `edge0` to `edge1` (either way round), clamped to 0..1. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
	if (edge0 === edge1) return x < edge0 ? 0 : 1;
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/** How far into the lens an item is: 1 at its center, falling to 0 at `radius`. */
export function focusAmount(distance: number, radius: number): number {
	return smoothstep(radius, 0, distance);
}

/** How still the field is: 1 at rest, 0 once it moves faster than `fast` px/s. */
export function calmness(speed: number, slow = 120, fast = 900): number {
	return 1 - smoothstep(slow, fast, speed);
}

/**
 * The scale that makes an item of `w` by `h` fill the lens's bloom: up to
 * `heightShare` of the screen's height and `widthShare` of its width.
 */
export function bloomScale(
	w: number,
	h: number,
	viewW: number,
	viewH: number,
	heightShare = 0.62,
	widthShare = 0.5
): number {
	return Math.max(1, Math.min((viewH * heightShare) / h, (viewW * widthShare) / w));
}

/**
 * An event card's height as it opens to its details, `open` of the way there
 * (0..1). It grows from its bloomed `height` toward the height its words take,
 * `need`, which is a multiple of its width: the card's type is sized by its
 * width, so that multiple holds at any size, and growing taller rather than
 * larger is what makes more room. It never grows past `max`, beyond which a
 * long description is cut short, and never shrinks below where it started.
 */
export function openHeight(
	width: number,
	height: number,
	need: number,
	max: number,
	open: number
): number {
	const target = Math.max(height, Math.min(width * need, max));
	return height + (target - height) * open;
}

/**
 * An item's scale for its focus. While the field moves fast, growth is held
 * to a fraction so passing items swell a little rather than strobe; the full
 * bloom waits until the water is still.
 */
export function focusScale(focus: number, calm: number, bloom: number): number {
	return 1 + (bloom - 1) * focus * (0.28 + 0.72 * calm);
}

/**
 * How far a neighbor at `offset` from the lens's center is pushed outward so
 * it doesn't sit under a bloomed item: water parting around it. `reach` is the
 * bloomed item's half-size plus a margin; `amount` is how bloomed it is.
 */
export function parting(offset: Vec, reach: number, amount: number): Vec {
	const distance = Math.hypot(offset.x, offset.y);
	if (distance === 0 || distance >= reach || amount <= 0) return { x: 0, y: 0 };
	const push = (reach - distance) * amount * 0.75;
	return { x: (offset.x / distance) * push, y: (offset.y / distance) * push };
}

/*
 * Zooming out. Drawn at the zoom, a field of ~1,400 items becomes a smear of
 * specks, so as the field zooms out, things step aside in order:
 *
 * 1. The lens and its captions rest, because a bloom in a crowd hides more than it shows.
 * 2. Event cards go, because their titles are too small to read.
 * 3. Pictures stop shrinking at a size where they can still be told apart
 *    (`floorZoom`), shrinking only slowly past it, and thin out instead, each keeping
 *    a fixed room about it on screen (`roomNeeded`).
 *
 * Which pictures stay is decided once, at load, by `thinningRoom`, so the same
 * ones always stay at the same zoom and the survivors are spread evenly over the
 * field rather than leaving bare patches. Pictures outrank cards, so every
 * picture has its place in the order before any card does.
 */

/** A thing to draw as a picture (not a card bearing a title). */
export function isPicture(item: FieldItem): boolean {
	return item.src !== null;
}

/**
 * For each placed item, the room it has: how far it is from the nearest item
 * that outranks it. An item is shown at a zoom only when it has at least the
 * room that zoom needs, so zooming out drops the items with the least room
 * first and zooming in brings them back in the reverse order.
 *
 * The order is farthest-point sampling, done within tiers (`tierOf`, lowest
 * first): each next item is the one farthest from all those before it. So the
 * items left at any zoom are as evenly spread as they can be, and any two of
 * them are at least the room that zoom needs apart. The first item has
 * infinite room. O(n²), which for the archive is a few milliseconds, once.
 */
export function thinningRoom(world: World, tierOf: (placed: Placed) => number): Float64Array {
	const { placed } = world;
	const n = placed.length;
	const room = new Float64Array(n);
	const nearest = new Float64Array(n).fill(Infinity);
	const tier = placed.map(tierOf);
	const picked = new Uint8Array(n);
	for (let count = 0; count < n; count++) {
		let pick = -1;
		for (let i = 0; i < n; i++) {
			if (picked[i]) continue;
			if (
				pick === -1 ||
				tier[i] < tier[pick] ||
				(tier[i] === tier[pick] && nearest[i] > nearest[pick])
			) {
				pick = i;
			}
		}
		picked[pick] = 1;
		room[pick] = nearest[pick];
		const from = placed[pick];
		for (let i = 0; i < n; i++) {
			if (picked[i]) continue;
			const offset = offsetFrom(from, placed[i], world);
			const distance = Math.hypot(offset.x, offset.y);
			if (distance < nearest[i]) nearest[i] = distance;
		}
	}
	return room;
}

/**
 * The zoom at which pictures stop shrinking with the field: when a layout
 * cell is `cellShare` of the screen's height. Never above 1.
 */
export function floorZoom(cell: number, viewH: number, cellShare = 0.12): number {
	return Math.min(1, (viewH * cellShare) / cell);
}

/**
 * How much bigger than its rest size an item is drawn at `zoom`: as the zoom
 * itself down to `floor`, and past it shrinking only by the zoom's `give`
 * power, so zooming still reads as zooming without the pictures turning to specks.
 */
export function itemScale(zoom: number, floor: number, give = 0.25): number {
	return zoom >= floor ? zoom : floor * Math.pow(zoom / floor, give);
}

/**
 * The room (world px) a picture must have to be shown at `zoom`: a fixed
 * `roomShare` of the screen's height, on screen. So the screen holds about
 * the same number of pictures however far out it is zoomed.
 */
export function roomNeeded(zoom: number, viewH: number, roomShare = 0.085): number {
	return (viewH * roomShare) / zoom;
}

/**
 * The farthest out the field may be zoomed: where the screen, plus `margin`
 * screen px at each edge, still fits inside one copy of the wrapping world.
 * Any farther and the same item could be due at both edges at once, while the
 * field can draw it only at one.
 */
export function widestZoom(
	world: Pick<World, 'width' | 'height'>,
	viewW: number,
	viewH: number,
	margin = 0
): number {
	return Math.max((viewW + 2 * margin) / world.width, (viewH + 2 * margin) / world.height);
}

/**
 * The zoom at which the first of these rooms would no longer be enough
 * (see `roomNeeded`): where thinning begins. 0 when there are none to thin.
 */
export function thinningStarts(rooms: Iterable<number>, viewH: number): number {
	let least = Infinity;
	for (const r of rooms) if (r < least) least = r;
	return Number.isFinite(least) && least > 0 ? roomNeeded(1, viewH) / least : 0;
}
