/**
 * Client loaders for the public archive blob. Both public pages fetch `/api/dataset`
 * (the whole, small, edge-cached dataset) and take their slice; the browser caches
 * the response, so visiting both pages downloads it at most once.
 */
import type { ArtefactWithEvent } from '$lib/server/db/schema';
import type { EventItem } from '$lib/events';

async function fetchDataset(): Promise<{
	artefacts: ArtefactWithEvent[];
	events: EventItem[];
	people: string[];
}> {
	const res = await fetch('/api/dataset');
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
