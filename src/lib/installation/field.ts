/**
 * The Archive Stream field: every public artefact page, photograph and event,
 * laid out on a world that wraps at its edges (a torus), so the water never
 * ends and there is no edge to bump into.
 *
 * Things that belong together sit together. An event, its artefacts and its
 * photographs form a cluster, and the clusters are laid out as a calendar (see
 * ./season): a column for each year, oldest at the left, and a row for each
 * season, winter at the top. Open water parts the columns and rows, and within
 * a year's season the clusters run left to right in date order. So drifting
 * sideways along a row is drifting through one time of year, year after year,
 * and drifting up or down is drifting through the seasons of one year. The
 * page names the year and the season in view at the screen's edges.
 *
 * Pure and free of the DOM: the projector page draws what this decides.
 * Positions are world pixels. `cam` is the world point at the screen's center.
 */

import type { Vec } from './physics.ts';
import { seasonOf, yearOf, type Season, type Year } from './season.ts';

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

/**
 * A year's column or a season's row of the calendar: where its items sit
 * along its axis, in world px, from `start` to `end`. The open water around
 * it is not part of it.
 */
export type Band = {
	key: string;
	/** What its mark says: "2023", "Summer", "Season unknown". */
	label: string;
	start: number;
	end: number;
};

export type World = {
	width: number;
	height: number;
	/** The side of one layout cell, and so roughly the gap between neighbors. */
	cell: number;
	placed: Placed[];
	/** The columns, along x: oldest first, then the undated. */
	years: Band[];
	/** The rows, along y: winter to fall, then the unknown. */
	seasons: Band[];
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
	/** About how many items one screen shows over a full season (the water between shows fewer). */
	perScreen?: number;
	/** The share of a season's places left empty, so the water has room to breathe. */
	emptyShare?: number;
	/** The open water between neighboring years, and between seasons, in cells. */
	channel?: number;
	/**
	 * The open water added where the newest year wraps round to the oldest, in
	 * cells, so the jump back reads as one rather than as the next year.
	 */
	seam?: number;
	seed?: number;
};

/**
 * A cluster's date: its earliest date known at least to the month, else its
 * earliest year-only date, else null. A finer date wins over an earlier coarse
 * one, so an event on 2019-07-04 whose program is filed under "2019" stays
 * in summer rather than falling back to the bare year.
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

/** A year's season: the items of one box of the calendar, by its column and row. */
export type CalendarCell = { year: number; season: number; items: FieldItem[] };

export type Calendar = {
	/** The columns, oldest first, then the undated. Only years with something in them. */
	years: Year[];
	/** The rows, winter to fall, then the unknown. Only seasons with something in them. */
	seasons: Season[];
	/** The boxes with something in them, each one's clusters in date order. */
	cells: CalendarCell[];
};

/**
 * The items gathered into a calendar (see ./season): by year, and within a
 * year by season. A cluster is never split: it joins the year and season of
 * its date, so an event's photographs sit with it even when one was taken the
 * week after, or the next January.
 */
export function groupByCalendar(items: readonly FieldItem[]): Calendar {
	const years = new Map<string, Year>();
	const seasons = new Map<string, Season>();
	const cells = new Map<string, { year: Year; season: Season; items: FieldItem[] }>();
	for (const cluster of orderedClusters(items)) {
		const year = yearOf(cluster.date);
		const season = seasonOf(cluster.date);
		years.set(year.key, year);
		seasons.set(season.key, season);
		const key = `${year.key} ${season.key}`;
		let cell = cells.get(key);
		if (!cell) {
			cell = { year, season, items: [] };
			cells.set(key, cell);
		}
		cell.items.push(...cluster.items);
	}
	const byKey = (a: { key: string }, b: { key: string }) =>
		a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
	const yearList = [...years.values()].sort(byKey);
	const seasonList = [...seasons.values()].sort(byKey);
	const yearIndex = new Map(yearList.map((year, i) => [year.key, i]));
	const seasonIndex = new Map(seasonList.map((season, i) => [season.key, i]));
	return {
		years: yearList,
		seasons: seasonList,
		cells: [...cells.values()].map((cell) => ({
			year: yearIndex.get(cell.year.key)!,
			season: seasonIndex.get(cell.season.key)!,
			items: cell.items
		}))
	};
}

/** The narrowest a year's column is, in cells, however little it holds. */
const MIN_WIDTH = 2;
/** The shortest a season's row is, in cells. */
const MIN_HEIGHT = 1;

/**
 * The places, `rows` by `cols`, that `count` items take in a box `w` by `h`
 * cells: about as far apart across as down, so a box holding a few spreads
 * them over itself rather than bunching them at its start, and never closer
 * than a cell either way while the box has room for that (see `fitWidths`).
 */
function lattice(count: number, w: number, h: number): { rows: number; cols: number } {
	const maxRows = Math.max(1, Math.floor(h));
	const maxCols = Math.max(1, Math.floor(w));
	const spacing = Math.sqrt((w * h) / count);
	let rows = Math.min(maxRows, Math.max(1, Math.round(h / spacing)));
	let cols = Math.ceil(count / rows);
	if (cols > maxCols) {
		rows = Math.min(maxRows, Math.ceil(count / maxCols));
		cols = Math.ceil(count / rows);
	}
	return { rows, cols };
}

/**
 * Lay the items out as a calendar: a column for each year and a row for each
 * season, parted by channels of open water, so the same time of year in
 * neighboring years sits side by side. Each year's season is a box whose items
 * sit on a grid of places in date order, filling each column of places top to
 * bottom (and the next back up again, so neighbors in date order are neighbors
 * in space) before moving right. So a season's row runs in date order from
 * left to right across all the years. Some places stay empty, and each item is
 * nudged off its place and given its own size, so the result reads as things
 * floating on water rather than as a grid.
 *
 * A season's row is as tall, and a year's column as wide, as its fullest box
 * needs. Of the shapes that allows, the one kept leaves the least open water
 * while staying near the screen's shape. The world is never smaller than a
 * screen, so no item can be seen twice at once across the seam.
 */
export function layoutField(items: readonly FieldItem[], options: LayoutOptions): World {
	const {
		viewW,
		viewH,
		perScreen = 37,
		emptyShare = 0.08,
		channel = 1,
		seam = 2,
		seed = 7
	} = options;
	const random = seededRandom(seed);
	const cell = Math.sqrt((viewW * viewH) / perScreen);
	const aspect = viewW / viewH;
	const minCols = viewW / cell + 1;
	const minRows = viewH / cell + 1;

	const calendar = groupByCalendar(items);
	const columns = calendar.years.length;
	const rowCount = calendar.seasons.length;
	/** The open water across the world: a channel after each year, and the seam. */
	const water = columns * channel + seam;
	if (!calendar.cells.length) {
		return {
			width: minCols * cell,
			height: minRows * cell,
			cell,
			placed: [],
			years: [],
			seasons: []
		};
	}
	// The places each box needs, empty ones included.
	const needs = calendar.cells.map((c) => Math.ceil(c.items.length / (1 - emptyShare)));

	// A box `w` by `h` has floor(w) by floor(h) places a cell apart, so these
	// give each box room for its places, a cell apart, at the least size.
	const fitWidths = (heights: readonly number[]) => {
		const widths = new Array<number>(columns).fill(MIN_WIDTH);
		calendar.cells.forEach((c, k) => {
			const across = Math.ceil(needs[k] / Math.floor(heights[c.season]));
			widths[c.year] = Math.max(widths[c.year], across);
		});
		return widths;
	};
	const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0);
	/** How much open water a calendar of these row heights leaves, and how far from the screen's shape it is. */
	const score = (heights: readonly number[]) => {
		const cols = Math.max(minCols, sum(fitWidths(heights)) + water);
		const height = Math.max(minRows, sum(heights) + rowCount * channel);
		return cols * height * (1 + Math.abs(Math.log(cols / height / aspect)));
	};

	// Try a range of heights for the whole calendar. For each, share it among
	// the seasons by how much they hold, then let each season's row grow or
	// shrink a cell at a time while that leaves less water: a busy winter in
	// one year is better met by a taller winter row than by that year's column
	// widening for every season. The years fit whatever the rows come to. Keep
	// whichever leaves the least water, still near the screen's shape.
	const seasonNeeds = new Array<number>(rowCount).fill(0);
	calendar.cells.forEach((c, k) => (seasonNeeds[c.season] += needs[k]));
	const totalNeed = sum(seasonNeeds);
	let best: { heights: number[]; score: number } | null = null;
	const tallest = Math.max(rowCount * MIN_HEIGHT, Math.sqrt(totalNeed / aspect) * 2);
	for (let total = rowCount * MIN_HEIGHT; total <= tallest + 1e-9; total += 1) {
		const heights = seasonNeeds.map((need) =>
			Math.max(MIN_HEIGHT, Math.round((total * need) / totalNeed))
		);
		let current = score(heights);
		for (let improved = true; improved;) {
			improved = false;
			for (let r = 0; r < rowCount; r++) {
				for (const delta of [1, -1]) {
					if (heights[r] + delta < MIN_HEIGHT) continue;
					heights[r] += delta;
					const next = score(heights);
					if (next < current - 1e-9) {
						current = next;
						improved = true;
					} else heights[r] -= delta;
				}
			}
		}
		if (!best || current < best.score) best = { heights: [...heights], score: current };
	}
	let heights = best!.heights;
	let widths = fitWidths(heights);
	// A small archive's calendar is smaller than a screen: stretch it to one.
	const across = sum(widths) + water;
	if (across < minCols) widths = widths.map((w) => (w * (minCols - water)) / sum(widths));
	const down = sum(heights) + rowCount * channel;
	if (down < minRows) {
		heights = heights.map((h) => (h * (minRows - rowCount * channel)) / sum(heights));
	}

	// Each band's start, in cells: half a channel in from its share of the world.
	const starts = (sizes: readonly number[]) => {
		let at = channel / 2;
		return sizes.map((size) => {
			const start = at;
			at += size + channel;
			return start;
		});
	};
	const lefts = starts(widths);
	const tops = starts(heights);

	const placed: Placed[] = [];
	calendar.cells.forEach((c, k) => {
		const w = widths[c.year];
		const h = heights[c.season];
		const { rows, cols } = lattice(needs[k], w, h);
		const dx = w / cols;
		const dy = h / rows;

		// Spread the empty places evenly, with a little randomness, rather than
		// leaving them all at the end.
		const total = rows * cols;
		const count = c.items.length;
		const empties = total - count;
		const skip = new Set<number>();
		for (let e = 0; e < empties; e++) {
			skip.add(Math.min(total - 1, Math.floor(((e + random()) * total) / empties)));
		}

		let next = 0;
		for (let index = 0; index < total && next < count; index++) {
			// Leave a place empty only while there are still enough places for the rest.
			if (skip.has(index) && total - index > count - next) continue;
			const item = c.items[next++];
			const col = Math.floor(index / rows);
			// Down one column of places, back up the next.
			const row = col % 2 === 0 ? index % rows : rows - 1 - (index % rows);
			const long =
				cell * 0.6 * (0.8 + random() * 0.32) * (item.kind === 'event' && !item.src ? 0.82 : 1);
			placed.push({
				item,
				x: (lefts[c.year] + (col + 0.5 + (random() - 0.5) * 0.44) * dx) * cell,
				y: (tops[c.season] + (row + 0.5 + (random() - 0.5) * 0.44) * dy) * cell,
				w: item.aspect >= 1 ? long : long * item.aspect,
				h: item.aspect >= 1 ? long / item.aspect : long,
				phase: random()
			});
		}
	});

	const band = (of: Year | Season, start: number, size: number): Band => ({
		key: of.key,
		label: of.label,
		start: start * cell,
		end: (start + size) * cell
	});
	return {
		width: (sum(widths) + water) * cell,
		height: (sum(heights) + rowCount * channel) * cell,
		cell,
		placed,
		years: calendar.years.map((year, i) => band(year, lefts[i], widths[i])),
		seasons: calendar.seasons.map((season, i) => band(season, tops[i], heights[i]))
	};
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

/** Where a band's mark sits on screen (see `placeMark`). */
export type MarkPlace = {
	/** The mark's center along the band's axis, in screen px from the screen's center. */
	at: number;
	/** How much longer the band's stretch in view is than the mark (screen px); below 0 it doesn't fit. */
	room: number;
	/** Whether the lens, at the screen's center, is over the band. */
	current: boolean;
};

/**
 * Where a year's or a season's mark goes along the screen's edge: at the
 * middle of the stretch of its band in view. So a band filling the screen is
 * named at the middle of the edge, over the lens; two bands sharing the screen
 * are each named over their own part; and a band leaving the screen takes its
 * name with it, never beyond its end. Null when none of the band is in view.
 *
 * Along one axis: `cam` is the camera's coordinate on it and `size` the
 * world's size along it (world px); `lo` and `hi` are the stretch of the screen
 * the marks may use and `length` is the mark's own length (screen px, from the
 * screen's center). A band may run over the seam, so of its copies the one
 * most in view is taken.
 */
export function placeMark(
	band: Band,
	cam: number,
	size: number,
	zoom: number,
	lo: number,
	hi: number,
	length: number
): MarkPlace | null {
	const center = wrapDelta((band.start + band.end) / 2 - cam, size);
	const reach = (band.end - band.start) / 2;
	let best: MarkPlace | null = null;
	for (const copy of [center - size, center, center + size]) {
		const start = Math.max(lo, (copy - reach) * zoom);
		const end = Math.min(hi, (copy + reach) * zoom);
		if (end <= start) continue;
		const room = end - start - length;
		if (best && room <= best.room) continue;
		best = { at: (start + end) / 2, room, current: Math.abs(copy) <= reach };
	}
	return best;
}
