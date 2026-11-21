/**
 * The /keeper/live feed: the artefacts that most recently went public, newest
 * first, and the pure bookkeeping the board does with each poll of it. Shared
 * by the server (which builds the feed) and the browser (which places it), so
 * it imports nothing from either side.
 *
 * "Went public" is the moment a vetted artefact joined the archive: when an
 * admin created it already vetted, or when an admin approved a contributor's
 * submission (`approved_at`, see the schema). An edit is not an arrival.
 */

/** One arrival, carrying exactly what the page draws: nothing else rides along. */
export type LiveArrival = {
	id: number;
	artefact: string;
	event: string | null;
	date: string | null;
	description: string | null;
	programArea: string[];
	fileUrls: string[];
	provenance: string[];
	/** When it went public, as epoch milliseconds. */
	arrivedAt: number;
};

/**
 * How many pages the board holds at once, and so how many arrivals the feed
 * carries: the newest this many are all the board could ever show. Kept far
 * below the public cloud's count so that each page can be drawn large enough
 * to read across a room. When another arrives, the oldest leaves.
 */
export const LIVE_FEED_SIZE = 6;

/** How often the page asks for the feed while it is on screen. */
export const LIVE_POLL_MS = 20_000;

/**
 * How long the board listens before it pauses itself: after five hours on
 * screen it stops polling and offers a button to resume, which listens for
 * another five. A board forgotten on a screen overnight then costs nothing
 * (each poll is a billed request, see src/routes/api/live) until someone comes
 * back to it.
 */
export const LIVE_LISTEN_MS = 5 * 60 * 60 * 1000;

/**
 * How far back the board reaches when it opens: an artefact that arrived up to
 * an hour before the page was opened is shown, one that arrived earlier never
 * is. Measured from the opening, not from now, so nothing that was on the board
 * when it opened ages off it later; only newer arrivals push it off.
 */
export const LIVE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Whether the board may show `item`, given when it was opened (see
 * LIVE_WINDOW_MS). `openedAt` is the browser's clock and `arrivedAt` the
 * server's, so a visitor whose clock is minutes off moves the edge by as much,
 * which an hour-wide window can bear.
 */
export function withinWindow(item: LiveArrival, openedAt: number): boolean {
	return item.arrivedAt >= openedAt - LIVE_WINDOW_MS;
}

/**
 * Which slot of the board each shown arrival stands in, given the slots they
 * stood in before (`previous`, id to slot index). A page keeps its slot for as
 * long as it is shown, so an arrival never makes the others move. A newcomer
 * takes the lowest-numbered free slot, the oldest newcomer first: slots are
 * numbered corner-first (see `boardSlots`), so the board fills from its edges.
 * An id left without a slot (more ids than slots) is simply not in the result.
 */
export function assignSlots(
	previous: Readonly<Record<number, number>>,
	shown: LiveArrival[],
	slotCount: number
): Record<number, number> {
	const next: Record<number, number> = {};
	const taken = new Set<number>();
	for (const item of shown) {
		const slot = previous[item.id];
		if (slot !== undefined && slot < slotCount && !taken.has(slot)) {
			next[item.id] = slot;
			taken.add(slot);
		}
	}
	const newcomers = shown
		.filter((item) => next[item.id] === undefined)
		.sort((a, b) => a.arrivedAt - b.arrivedAt || a.id - b.id);
	let free = 0;
	for (const item of newcomers) {
		while (taken.has(free)) free++;
		if (free >= slotCount) break;
		next[item.id] = free;
		taken.add(free);
	}
	return next;
}
