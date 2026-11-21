/**
 * The Archive Stream field: every public artefact page, photograph and event,
 * laid out on a world that wraps at its edges (a torus), so the water never
 * ends and there is no edge to bump into.
 *
 * Things that belong together sit together. An event, its artefacts and its
 * photographs form a cluster. The clusters of each season of each year form an
 * island, labeled at its center with its year ("2024"); the islands of each
 * season, from every year, form an archipelago, labeled at its head with its
 * season ("Winter"); and within an island the clusters run in date order. So
 * drifting through an archipelago is drifting through the years of one season,
 * drifting nearby is finding related things, and the bubbles say which season
 * and year you are in. The straits between years are narrower than the
 * channels between seasons, so the field reads as seasons first, then years.
 *
 * Pure and free of the DOM: the projector page draws what this decides.
 * Positions are world pixels. `cam` is the world point at the screen's center.
 */

import type { Vec } from './physics.ts';
import { seasonOf, seasonYearOf, type Season, type SeasonYear } from './season.ts';

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
 * A bubble naming a group, by the place it sits: a season's at the head of its
 * archipelago, a year's at the center of its island.
 */
export type Group = {
	/** A season's key, or a year's as `season/year`: unique across the world. */
	key: string;
	level: 'season' | 'year';
	/** What the bubble says: "Winter", "Season unknown", "2024", "2023–24". */
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
	/**
	 * Each season, winter to fall and then the unknown, followed by its years
	 * in date order.
	 */
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
	/** The open water between neighboring seasons, in cells. */
	channel?: number;
	/** The open water between neighboring years within a season, in cells. */
	strait?: number;
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

export type YearGroup = SeasonYear & { items: FieldItem[] };

export type SeasonGroup = Season & {
	items: FieldItem[];
	/** The season's items again, by year (see #lib/installation/season), in date order. */
	years: YearGroup[];
};

const byKey = (a: { key: string }, b: { key: string }) =>
	a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

/**
 * The items gathered into seasons across the years (see
 * #lib/installation/season), winter to fall, and within each season into its
 * years, each season's and each year's clusters in date order. A cluster is
 * never split: it joins the season and year of its date, so an event's
 * photographs sit with it even when one was taken the week after.
 */
export function groupBySeason(items: readonly FieldItem[]): SeasonGroup[] {
	const groups = new Map<string, SeasonGroup>();
	/** Each season's years, by key. */
	const yearsOf = new Map<string, Map<string, YearGroup>>();
	for (const cluster of orderedClusters(items)) {
		const season = seasonOf(cluster.date);
		let group = groups.get(season.key);
		let years = yearsOf.get(season.key);
		if (!group || !years) {
			group = { ...season, items: [], years: [] };
			years = new Map();
			groups.set(season.key, group);
			yearsOf.set(season.key, years);
		}
		group.items.push(...cluster.items);
		const year = seasonYearOf(cluster.date);
		let inYear = years.get(year.key);
		if (!inYear) {
			inYear = { ...year, items: [] };
			years.set(year.key, inYear);
			group.years.push(inYear);
		}
		inYear.items.push(...cluster.items);
	}
	// The years arrive in date order with their clusters; sorting by key
	// makes that hold by construction rather than by that ordering.
	for (const group of groups.values()) group.years.sort(byKey);
	return [...groups.values()].sort(byKey);
}

/** A cell of an island, as whole-cell offsets from the island's center. */
type Cell = { i: number; j: number };

/**
 * An island's outline is a superellipse, |x/a|^n + |y/b|^n <= 1: rounder than
 * a rectangle, so it reads as an island, but squarer than an ellipse, so it
 * leaves less of its slot as open water.
 */
const SHAPE = 3;
/** Kept clear at every island's center for its bubble: the label is wider than tall. */
const isBubble = (i: number, j: number) => j === 0 && Math.abs(i) <= 1;
/**
 * The coastline dips in and out, by up to a seventh of the way in, and about
 * this far on average: its reach, as a share of the outline's.
 */
const SHORE_AVERAGE = 0.93;

/**
 * The cells within a superellipse reaching `rx` and `ry` from its center (to
 * the outermost cells' centers), its coast at `shore` of that reach for each
 * angle, less the bubble's. In serpentine row order, the top row left to right
 * and the next back again, so neighbors in date order are neighbors in space.
 */
function outline(rx: number, ry: number, shore: (theta: number) => number): Cell[] {
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
}

/**
 * How far an island `w` by `h` cells reaches from its center to its outer
 * cells' centers: cell centers sit at whole offsets, so (w - 1) / 2, and
 * never so little that the bubble's row has no shore either side of it.
 */
const reach = (w: number, h: number) => ({
	rx: Math.max(1.5, (w - 1) / 2),
	ry: Math.max(0.5, (h - 1) / 2)
});

/**
 * The cells of an island `w` by `h` cells: those within its outline, less the
 * bubble's (see `outline`). The coastline dips in and out, so islands aren't
 * stamped from one mold. A box is sized to hold its items (see `roundSide`),
 * but a coast that dips in more than most can leave it a cell or two short of
 * `least`, and then the outline grows a little past the box.
 */
function islandCells(least: number, w: number, h: number, random: () => number): Cell[] {
	const a = random() * Math.PI * 2;
	const b = random() * Math.PI * 2;
	const shore = (theta: number) =>
		1 - 0.04 * (1 - Math.sin(3 * theta + a)) - 0.03 * (1 - Math.sin(5 * theta + b));
	const { rx, ry } = reach(w, h);
	for (let grow = 1; ; grow *= 1.03) {
		const cells = outline(rx * grow, ry * grow, shore);
		if (cells.length >= least) return cells;
	}
}

/** The fewest cells across an island: its bubble's three, with shore either side. */
const SMALLEST = 3.5;

const sides = new Map<number, number>();
/**
 * The side of the smallest round island with `needed` cells, counted on its
 * actual outline with the coast at its average reach, in quarter cells. So a
 * small island, where the bubble and the steps of the coast take much of its
 * box, gets the room it really needs.
 */
function roundSide(needed: number): number {
	let side = sides.get(needed);
	if (side !== undefined) return side;
	for (side = SMALLEST; ; side += 0.25) {
		const { rx, ry } = reach(side, side);
		if (outline(rx, ry, () => SHORE_AVERAGE).length >= needed) break;
	}
	sides.set(needed, side);
	return side;
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

/** The band of open water at the head of a season where its bubble sits, in cells. */
const HEAD = 2;
/** The narrowest a season may be, so its name fits across its head. */
const SEASON_WIDTH = 4.5;

/**
 * The box an island or a season would like, `w` by `h` cells, and the area it
 * needs whatever its shape.
 */
type Want = { area: number; w: number; h: number };

/**
 * A box for `want` in a row with `room` cells of height: its own shape if that
 * fits, else as tall as the room and stretched along the row to keep its area.
 */
function fitBox(want: Want, room: number): { w: number; h: number } {
	const h = Math.min(room, want.h);
	return { w: Math.max(h === want.h ? want.w : 0, want.area / h, SMALLEST), h };
}

/** A box in a frame, by its center relative to the frame's top left, and its row. */
type Slot = { x: number; y: number; w: number; h: number; row: number };

/**
 * `wants` boxed for rows `rowH` tall and balanced over `count` rows with `gap`
 * between boxes: the boxes, the rows (as indices into them) and the longest
 * row's length. Null when they make fewer rows than that, a count already tried.
 */
function rowsOf(wants: readonly Want[], rowH: number, count: number, gap: number) {
	const boxes = wants.map((want) => fitBox(want, rowH));
	const rows = balancedRows(
		boxes.map((b) => b.w + gap),
		count
	);
	if (rows.length < count) return null;
	const length = (row: number[]) => row.reduce((sum, k) => sum + boxes[k].w + gap, 0) - gap;
	return { boxes, rows, longest: Math.max(...rows.map(length)) };
}

/** The height of each of `count` rows in a frame `h` tall, with `gap` between them. */
const rowHeight = (h: number, count: number, gap: number) => (h - (count - 1) * gap) / count;

/**
 * The narrowest frame `h` cells tall that holds `wants` as `arrange` lays
 * them, none squeezed below the box it wants: Infinity when none fits.
 */
function widthAt(wants: readonly Want[], h: number, gap: number): number {
	let least = Infinity;
	for (let count = 1; count <= wants.length; count++) {
		const rowH = rowHeight(h, count, gap);
		if (rowH < SMALLEST) break;
		const laid = rowsOf(wants, rowH, count, gap);
		if (laid) least = Math.min(least, laid.longest);
	}
	return least;
}

/**
 * Lays `wants` out in order filling a frame `w` by `h` cells: in rows of one
 * height with `gap` of water between boxes and between rows, serpentine (odd
 * rows run right to left), each row's boxes widening in step to fill its
 * width. Of the row counts that fit without squeezing a box narrower than it
 * wants, it takes the one whose boxes come out roundest, each weighed by its
 * area. A frame from `widthAt` always has such a count; were there none, it
 * would take the least squeezed.
 */
function arrange(wants: readonly Want[], w: number, h: number, gap: number): Slot[] {
	let best: { slots: Slot[]; squeeze: number; cost: number } | null = null;
	for (let count = 1; count <= wants.length; count++) {
		const rowH = rowHeight(h, count, gap);
		if (count > 1 && rowH < SMALLEST) break;
		const laid = rowsOf(wants, rowH, count, gap);
		if (!laid) continue;
		const slots: Slot[] = [];
		let cost = 0;
		const squeeze = Math.max(0, laid.longest - w);
		laid.rows.forEach((row, r) => {
			const natural = row.reduce((sum, k) => sum + laid.boxes[k].w, 0);
			const stretch = (w - (row.length - 1) * gap) / natural;
			const y = r * (rowH + gap) + rowH / 2;
			let left = 0;
			for (const k of row) {
				const bw = laid.boxes[k].w * stretch;
				const bh = laid.boxes[k].h;
				slots[k] = { x: r % 2 === 0 ? left + bw / 2 : w - left - bw / 2, y, w: bw, h: bh, row: r };
				left += bw + gap;
				cost += wants[k].area * Math.abs(Math.log(bw / bh));
			}
		});
		if (
			!best ||
			squeeze < best.squeeze - 1e-9 ||
			(Math.abs(squeeze - best.squeeze) <= 1e-9 && cost < best.cost)
		) {
			best = { slots, squeeze, cost };
		}
	}
	return best?.slots ?? [];
}

/** A season's frame `h` cells tall, its head included: as narrow as holds its years. */
function seasonBox(wants: readonly Want[], h: number, gap: number): { w: number; h: number } {
	return { w: Math.max(SEASON_WIDTH, widthAt(wants, h - HEAD, gap)), h };
}

/**
 * The box a season would like for its year islands, `wants`, with `gap`
 * between them and its head included: about as wide as tall, with the least
 * open water.
 */
function seasonWant(wants: readonly Want[], gap: number): Want {
	const total = wants.reduce((sum, want) => sum + (want.w + gap) * (want.h + gap), 0);
	const tallest = Math.max(SMALLEST, ...wants.map((want) => want.h));
	const highest = HEAD + Math.max(tallest, 2 * Math.sqrt(total));
	let best: (Want & { score: number }) | null = null;
	for (let h = HEAD + SMALLEST; h <= highest + 1e-9; h += 0.25) {
		const { w } = seasonBox(wants, h, gap);
		if (!Number.isFinite(w)) continue;
		const score = w * h * (1 + Math.abs(Math.log(w / h)));
		if (!best || score < best.score) best = { area: w * h, w, h, score };
	}
	const { w, h } = best ?? { w: SEASON_WIDTH, h: HEAD + SMALLEST };
	return { area: w * h, w, h };
}

/**
 * Lay the items out as islands, one per season of each year, each with its
 * bubble's cells kept clear at its center. Within an island the items sit on
 * a grid of cells in date order; some cells stay empty, and each item is
 * nudged off its cell's center and given its own size, so the result reads as
 * things floating on water rather than as a grid.
 *
 * A season's islands gather into an archipelago, its years in date order
 * along rows (`arrange`), with a strait of open water between years and a
 * band at its head where the season's bubble sits. The archipelagos run
 * winter to fall along rows of one height, a serpentine again (left to right,
 * then back), so drifting in one direction is drifting through the year. A
 * season too big to be round at that height stretches along its row instead,
 * and each row's seasons widen to fill the world's width, so the open water
 * is the channels between seasons, the straits between years and the water
 * around the small ones. The world is shaped like the screen and never
 * smaller than one, so no item can be seen twice at once across the seam.
 */
export function layoutField(items: readonly FieldItem[], options: LayoutOptions): World {
	const {
		viewW,
		viewH,
		perScreen = 37,
		emptyShare = 0.08,
		channel = 2,
		strait = 1,
		seed = 7
	} = options;
	const random = seededRandom(seed);
	const cell = Math.sqrt((viewW * viewH) / perScreen);
	const aspect = viewW / viewH;
	const minCols = viewW / cell + 1;
	const minRows = viewH / cell + 1;

	const seasons = groupBySeason(items).map((group) => {
		const years = group.years.map((year) => {
			const needed = Math.ceil(year.items.length / (1 - emptyShare));
			// The size of its box when round, and never too small for its bubble.
			const side = roundSide(needed);
			return { year, want: { area: side * side, w: side, h: side } };
		});
		return {
			group,
			years,
			want: seasonWant(
				years.map((year) => year.want),
				strait
			)
		};
	});

	/**
	 * A season's box in a row `rowH` cells tall: its own shape if that fits,
	 * else as tall as the row and as wide as it then needs to be.
	 */
	const box = (season: (typeof seasons)[number], rowH: number) => {
		const room = rowH - channel;
		if (room >= season.want.h) return { w: season.want.w, h: season.want.h };
		return seasonBox(
			season.years.map((year) => year.want),
			room,
			strait
		);
	};

	// Try a range of row heights, from the least that holds a season's head
	// and one island. For each, take the number of rows that gives the world
	// the screen's shape, balance the seasons across them, and keep whichever
	// leaves the least open water, still near the screen's shape.
	let best: { rowH: number; cols: number; rows: number[][]; score: number } | null = null;
	const lowest = HEAD + SMALLEST + channel;
	const tallest = Math.max(lowest, ...seasons.map((season) => season.want.h + channel));
	for (let rowH = lowest; rowH <= tallest + 1e-9; rowH += 0.25) {
		const widths = seasons.map((season) => box(season, rowH).w + channel);
		const length = widths.reduce((sum, width) => sum + width, 0);
		const target = Math.max(1, Math.round(Math.sqrt(length / (rowH * aspect))));
		for (const count of [target - 1, target, target + 1]) {
			if (count < 1) continue;
			const rows = seasons.length ? balancedRows(widths, count) : [];
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

	/**
	 * Fills an island `w` by `h` cells centered at (`cx`, `cy`) with `items`
	 * in date order, its cells' order mirrored when `flip` is -1.
	 */
	const fillIsland = (
		items: readonly FieldItem[],
		cx: number,
		cy: number,
		w: number,
		h: number,
		flip: number
	) => {
		const cells = islandCells(items.length, w, h, random);
		// Spread the empty cells evenly, with a little randomness, rather than
		// leaving them all at the end of the last row.
		const total = cells.length;
		const empties = total - items.length;
		const skip = new Set<number>();
		for (let k = 0; k < empties; k++) {
			skip.add(Math.min(total - 1, Math.floor(((k + random()) * total) / empties)));
		}

		let next = 0;
		for (let index = 0; index < total && next < items.length; index++) {
			// Leave a cell empty only while there are still enough cells for the rest.
			if (skip.has(index) && total - index > items.length - next) continue;
			const item = items[next++];
			const long =
				cell * 0.6 * (0.8 + random() * 0.32) * (item.kind === 'event' && !item.src ? 0.82 : 1);
			placed.push({
				item,
				x: (cx + flip * cells[index].i + (random() - 0.5) * 0.44) * cell,
				y: (cy + cells[index].j + (random() - 0.5) * 0.44) * cell,
				w: item.aspect >= 1 ? long : long * item.aspect,
				h: item.aspect >= 1 ? long / item.aspect : long,
				phase: random()
			});
		}
	};

	rows.forEach((row, r) => {
		const boxes = row.map((k) => {
			const b = box(seasons[k], best!.rowH);
			// A full-height season takes the row's full height.
			return b.h === best!.rowH - channel ? { w: b.w, h: rowH - channel } : b;
		});
		// Each season widens in step with the others, to fill the row.
		const natural = boxes.reduce((sum, b) => sum + b.w, 0);
		const stretch = (cols - row.length * channel) / natural;
		let x = 0;
		const slots = row.map((k, n) => {
			const w = boxes[n].w * stretch;
			const slot = { season: seasons[k], w, h: boxes[n].h, left: x };
			x += w + channel;
			return slot;
		});

		// The serpentine: odd rows run right to left, and everything in them is
		// mirrored, so each season's own date order runs with the row.
		const sign = r % 2 === 0 ? 1 : -1;
		for (const slot of slots) {
			const cx =
				r % 2 === 0
					? slot.left + channel / 2 + slot.w / 2
					: cols - slot.left - channel / 2 - slot.w / 2;
			const top = r * rowH + rowH / 2 - slot.h / 2;
			const { group, years } = slot.season;
			groups.push({
				key: group.key,
				level: 'season',
				label: group.label,
				x: cx * cell,
				y: (top + HEAD / 2) * cell
			});

			const frame = arrange(
				years.map((year) => year.want),
				slot.w,
				slot.h - HEAD,
				strait
			);
			years.forEach(({ year }, k) => {
				const at = frame[k];
				const ix = cx + sign * (at.x - slot.w / 2);
				const iy = top + HEAD + at.y;
				groups.push({
					key: `${group.key}/${year.key}`,
					level: 'year',
					label: year.label,
					x: ix * cell,
					y: iy * cell
				});
				// An island in one of the season's own odd rows runs back again.
				fillIsland(year.items, ix, iy, at.w, at.h, at.row % 2 === 0 ? sign : -sign);
			});
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
