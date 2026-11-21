/**
 * Client loaders for the public archive. The public pages fetch `/api/dataset`
 * (the whole, small, edge-cached dataset) and take their slice; the browser caches
 * the response, so visiting several downloads it at most once. /keeper/live instead
 * polls `/api/live`, a short feed of the latest arrivals.
 */
import { goto } from '$app/navigation';
import { LOCKED_PATH } from '#lib/access/paths.ts';
import { sendBeat } from '#lib/access/presence.ts';
import type { ArtefactWithEvent } from '#lib/server/db/schema.ts';
import type { EventItem } from '#lib/events.ts';
import type { LiveArrival } from '#lib/live.ts';
import type { PublicImageSet } from '#lib/images/types.ts';

type Dataset = {
	artefacts: ArtefactWithEvent[];
	events: EventItem[];
	people: string[];
	images: PublicImageSet[];
};

const EMPTY: Dataset = { artefacts: [], events: [], people: [], images: [] };

/**
 * GET a gated archive path. A 401 means the gate turned us away: the pass lapsed
 * while the tab was away, or a keeper's ran out between visits. One beat settles
 * which — it hands a signed-in keeper a new pass (see #lib/server/access) and
 * does nothing for anyone else — so try once more, and if the archive really has
 * drifted shut, show the locked page and answer null.
 */
async function gatedFetch(path: string): Promise<Response | null> {
	let res = await fetch(path);
	if (res.status === 401) {
		await sendBeat().catch(() => {});
		res = await fetch(path);
		if (res.status === 401) {
			await goto(LOCKED_PATH);
			return null;
		}
	}
	if (!res.ok) throw new Error(`${path} fetch failed: ${res.status}`);
	return res;
}

/**
 * Partial, because a blob cached before a slice existed (at the edge, or in the
 * browser) arrives without that key: each loader defaults its own slice to empty.
 * A locked archive shows the locked page rather than an empty cloud.
 */
async function fetchDataset(): Promise<Partial<Dataset>> {
	const res = await gatedFetch('/api/dataset');
	return res ? res.json() : EMPTY;
}

/**
 * The /keeper/live feed (#lib/live), newest first; null when the archive has drifted
 * shut and the page is on its way to the locked page.
 */
export async function loadLiveFeed(): Promise<LiveArrival[] | null> {
	const res = await gatedFetch('/api/live');
	return res ? res.json() : null;
}

export async function loadArtefacts(): Promise<ArtefactWithEvent[]> {
	return (await fetchDataset()).artefacts ?? [];
}

export async function loadEvents(): Promise<EventItem[]> {
	return (await fetchDataset()).events ?? [];
}

export async function loadPeople(): Promise<string[]> {
	return (await fetchDataset()).people ?? [];
}

export async function loadImageSets(): Promise<PublicImageSet[]> {
	return (await fetchDataset()).images ?? [];
}
