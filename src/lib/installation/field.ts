/**
 * The Archive Stream field: every public artefact page, photograph and event,
 * laid out on a world that wraps at its edges (a torus), so the water never
 * ends and there is no edge to bump into.
 *
 * Things that belong together sit together. An event, its artefacts and its
 * photographs form a cluster, and clusters run in date order through the
 * world, so drifting in one direction is drifting through time and drifting
 * nearby is finding related things.
 *
 * Pure and free of the DOM: the projector page draws what this decides.
 * Positions are world pixels. `cam` is the world point at the screen's center.
 */

import type { Vec } from './physics.ts';

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

export type World = {
	width: number;
	height: number;
	/** The side of one layout cell, and so roughly the gap between neighbors. */
	cell: number;
	placed: Placed[];
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
	/** About how many items one screen shows. */
	perScreen?: number;
	/** The share of cells left empty, so the water has room to breathe. */
	emptyShare?: number;
	seed?: number;
};

/**
 * Clusters in date order, undated ones last, each cluster's items in the order
 * given. Lexicographic order on partial dates is chronological order (see
 * #lib/partialDate), so plain string comparison sorts them.
 */
export function orderByCluster(items: readonly FieldItem[]): FieldItem[] {
	const clusters = new Map<string, { date: string | null; first: number; items: FieldItem[] }>();
	items.forEach((item, i) => {
		let cluster = clusters.get(item.cluster);
		if (!cluster) {
			cluster = { date: null, first: i, items: [] };
			clusters.set(item.cluster, cluster);
		}
		cluster.items.push(item);
		if (item.date && (!cluster.date || item.date < cluster.date)) cluster.date = item.date;
	});
	return [...clusters.values()]
		.sort((a, b) => {
			if (a.date === b.date) return a.first - b.first;
			if (a.date === null) return 1;
			if (b.date === null) return -1;
			return a.date < b.date ? -1 : 1;
		})
		.flatMap((cluster) => cluster.items);
}

/**
 * Lay the items out on a grid of cells, row by row in a serpentine (left to
 * right, then back), so each item's neighbors in date order are its neighbors
 * in space. Some cells stay empty, and each item is nudged off its cell's
 * center and given its own size, so the result reads as things floating on
 * water rather than as a grid.
 */
export function layoutField(items: readonly FieldItem[], options: LayoutOptions): World {
	const { viewW, viewH, perScreen = 24, emptyShare = 0.14, seed = 7 } = options;
	const random = seededRandom(seed);
	const cell = Math.sqrt((viewW * viewH) / perScreen);
	const ordered = orderByCluster(items);

	const cellCount = Math.max(1, Math.ceil(ordered.length / (1 - emptyShare)));
	// Shaped like the screen, and never narrower than one screen, so no item can
	// be seen twice at once across the seam.
	const cols = Math.max(
		Math.ceil(viewW / cell) + 1,
		Math.ceil(Math.sqrt((cellCount * viewW) / viewH))
	);
	const rows = Math.max(Math.ceil(viewH / cell) + 1, Math.ceil(cellCount / cols));
	const total = cols * rows;

	// Spread the empty cells evenly, with a little randomness, rather than
	// leaving them all at the end of the last row.
	const empties = total - ordered.length;
	const skip = new Set<number>();
	for (let k = 0; k < empties; k++) {
		const at = Math.floor(((k + random()) * total) / empties);
		skip.add(Math.min(total - 1, at));
	}

	const placed: Placed[] = [];
	let next = 0;
	for (let index = 0; index < total && next < ordered.length; index++) {
		// Leave a cell empty only while there are still enough cells for the rest.
		if (skip.has(index) && total - index > ordered.length - next) continue;
		const row = Math.floor(index / cols);
		const along = index % cols;
		const col = row % 2 === 0 ? along : cols - 1 - along;
		const item = ordered[next++];

		const long =
			cell * 0.6 * (0.8 + random() * 0.32) * (item.kind === 'event' && !item.src ? 0.82 : 1);
		const w = item.aspect >= 1 ? long : long * item.aspect;
		const h = item.aspect >= 1 ? long / item.aspect : long;
		placed.push({
			item,
			x: (col + 0.5 + (random() - 0.5) * 0.44) * cell,
			y: (row + 0.5 + (random() - 0.5) * 0.44) * cell,
			w,
			h,
			phase: random()
		});
	}

	return { width: cols * cell, height: rows * cell, cell, placed };
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
