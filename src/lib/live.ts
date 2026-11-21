/**
 * The /keeper/live feed: the artefacts that most recently went public, newest first,
 * and the pure bookkeeping the page does with each poll of it. Shared by the
 * server (which builds the feed) and the browser (which diffs it), so it imports
 * nothing from either side.
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

/** How many arrivals the feed carries: the featured one plus the row beneath it. */
export const LIVE_FEED_SIZE = 13;

/** How often the page asks for the feed while it is on screen. */
export const LIVE_POLL_MS = 20_000;

/**
 * The arrivals in `feed` that `seen` has never held, oldest first: the order
 * they should play in, so a burst lands in the order it happened. `seen` is
 * every id the page has shown or queued, so an artefact that drops out of the
 * feed (deleted, or pushed past its end) and comes back is not announced twice.
 */
export function newArrivals(seen: ReadonlySet<number>, feed: LiveArrival[]): LiveArrival[] {
	return feed
		.filter((item) => !seen.has(item.id))
		.sort((a, b) => a.arrivedAt - b.arrivedAt || a.id - b.id);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 24 * 60 * 60 * 1000],
	['month', 30 * 24 * 60 * 60 * 1000],
	['week', 7 * 24 * 60 * 60 * 1000],
	['day', 24 * 60 * 60 * 1000],
	['hour', 60 * 60 * 1000],
	['minute', 60 * 1000]
];

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

/**
 * "just now", "5 minutes ago", "yesterday": how long ago `then` was, at `now`.
 * Anything under a minute, or in the future (the visitor's clock running behind
 * the server's), reads as just now rather than "in 2 minutes".
 */
export function arrivedAgo(then: number, now: number): string {
	const elapsed = now - then;
	for (const [unit, ms] of UNITS) {
		if (elapsed >= ms) return relative.format(-Math.floor(elapsed / ms), unit);
	}
	return 'just now';
}
