/**
 * Everything the Archive Stream shows, as field items: each page of each
 * artefact, each photograph of each image set, and every event. An event with
 * a feature image shows it; one without is drawn as a card bearing its title,
 * which opens to its date, hosts and description once it is in focus.
 *
 * Each event is its own cluster, and its artefacts and photographs join it.
 * The public dataset links those by the event's title alone, and a recurring
 * event ("Yoga in the Garden") has dozens of dates under one title, so an
 * artefact or set joins the one with that title nearest its own date.
 *
 * Titles are carried exactly as the archive holds them. An event's title is
 * the source page's own words (see AGENTS.md), so nothing here shortens or
 * tidies it.
 *
 * The operator can leave whole kinds out (see ./kinds). That is decided here
 * rather than by filtering the result, because the kinds lean on each other:
 * artefacts and photographs still gather by event when the events themselves
 * are hidden, and an event gets its own picture back when the artefact or
 * photograph that would have shown it is.
 */

import type { EventItem } from '#lib/events.ts';
import { fileExt } from '#lib/fileType.ts';
import type { PublicImageSet } from '#lib/images/types.ts';
import { A4_ASPECT, CARD_ASPECT, type FieldItem, type FieldKind } from './field.ts';

/** What the field needs of an artefact (a slice of `ArtefactWithEvent`). */
export type FieldArtefact = {
	id: number;
	artefact: string;
	date: string | null;
	fileUrls: string[];
	event: string | null;
};

/** Raster scans only: an attachment can also be a PDF, which can't be drawn as an image. */
const RASTER = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif']);

/** A partial date as a day number, taken at its start; null when there is none. */
function dayNumber(date: string | null): number | null {
	const match = date ? /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(date) : null;
	if (!match) return null;
	const [, year, month = '01', day = '01'] = match;
	return Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000;
}

/**
 * Finds the cluster an artefact or set belongs to: that of the event with its
 * title nearest its date (the first such event when either is undated).
 */
function eventClusters(events: readonly EventItem[]) {
	const byTitle = new Map<string, { cluster: string; day: number | null }[]>();
	for (const event of events) {
		const list = byTitle.get(event.title) ?? [];
		list.push({ cluster: `event:${event.id}`, day: dayNumber(event.date) });
		byTitle.set(event.title, list);
	}
	return (title: string | null, date: string | null): string | null => {
		const candidates = title ? byTitle.get(title) : undefined;
		if (!candidates?.length) return null;
		const day = dayNumber(date);
		if (day === null) return candidates[0].cluster;
		let best = candidates[0];
		let bestGap = Infinity;
		for (const candidate of candidates) {
			const gap = candidate.day === null ? Infinity : Math.abs(candidate.day - day);
			if (gap < bestGap) {
				best = candidate;
				bestGap = gap;
			}
		}
		return best.cluster;
	};
}

export function buildFieldItems(data: {
	artefacts: readonly FieldArtefact[];
	events: readonly EventItem[];
	imageSets: readonly PublicImageSet[];
	/** The kinds to show; all of them when left out. */
	kinds?: ReadonlySet<FieldKind>;
}): FieldItem[] {
	const wants = (kind: FieldKind) => !data.kinds || data.kinds.has(kind);
	const items: FieldItem[] = [];
	const shown = new Set<string>();
	const clusterOf = eventClusters(data.events);

	for (const artefact of wants('artefact') ? data.artefacts : []) {
		const cluster = clusterOf(artefact.event, artefact.date) ?? `artefact:${artefact.id}`;
		artefact.fileUrls.forEach((url, page) => {
			if (!RASTER.has(fileExt(url))) return;
			shown.add(url);
			items.push({
				id: `a${artefact.id}-${page}`,
				kind: 'artefact',
				src: url,
				aspect: A4_ASPECT,
				placeholder: null,
				title: artefact.artefact,
				date: artefact.date,
				details: null,
				cluster
			});
		});
	}

	for (const set of wants('photo') ? data.imageSets : []) {
		const cluster = clusterOf(set.event, set.date) ?? `set:${set.id}`;
		for (const image of set.images) {
			shown.add(image.url);
			items.push({
				id: `p${image.id}`,
				kind: 'photo',
				src: image.url,
				aspect: image.width > 0 && image.height > 0 ? image.width / image.height : 1,
				placeholder: image.placeholder,
				title: set.event ?? set.description ?? '',
				date: image.capturedDate ?? set.date,
				details: null,
				cluster
			});
		}
	}

	for (const event of wants('event') ? data.events : []) {
		// An event featuring a picture the field already shows becomes a card, so
		// the same picture doesn't float twice side by side.
		const feature = event.featureImage;
		const src = feature && !shown.has(feature.url) ? feature.url : null;
		items.push({
			id: `e${event.id}`,
			kind: 'event',
			src,
			aspect: !src
				? CARD_ASPECT
				: feature?.width && feature.height
					? feature.width / feature.height
					: A4_ASPECT,
			placeholder: null,
			title: event.title,
			date: event.date,
			details: { time: event.time, description: event.description, hosts: event.hosts },
			cluster: `event:${event.id}`
		});
	}

	return items;
}
