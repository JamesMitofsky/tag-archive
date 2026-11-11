/**
 * Client loaders for the public archive blob. The public pages fetch `/api/dataset`
 * (the whole, small, edge-cached dataset) and take their slice; the browser caches
 * the response, so visiting several downloads it at most once.
 */
import { goto } from '$app/navigation';
import { LOCKED_PATH } from '$lib/access/paths';
import { sendBeat } from '$lib/access/presence';
import type { ArtefactWithEvent } from '$lib/server/db/schema';
import type { EventItem } from '$lib/events';
import type { PublicImageSet } from '$lib/images/types';

type Dataset = {
	artefacts: ArtefactWithEvent[];
	events: EventItem[];
	people: string[];
	images: PublicImageSet[];
};

const EMPTY: Dataset = { artefacts: [], events: [], people: [], images: [] };

/**
 * Partial, because a blob cached before a slice existed (at the edge, or in the
 * browser) arrives without that key: each loader defaults its own slice to empty.
 */
async function fetchDataset(): Promise<Partial<Dataset>> {
	let res = await fetch('/api/dataset');
	if (res.status === 401) {
		// The gate turned us away: the pass lapsed while the tab was away, or a
		// keeper's ran out between visits. One beat settles which — it hands a
		// signed-in keeper a new pass (see $lib/server/access) and does nothing for
		// anyone else — so try once more, and if the archive really has drifted
		// shut, show the locked page rather than an empty cloud.
		await sendBeat().catch(() => {});
		res = await fetch('/api/dataset');
		if (res.status === 401) {
			await goto(LOCKED_PATH);
			return EMPTY;
		}
	}
	if (!res.ok) throw new Error(`dataset fetch failed: ${res.status}`);
	return res.json();
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
