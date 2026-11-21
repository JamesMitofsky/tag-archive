import type { FeatureImage } from '#lib/featureImage.ts';

/**
 * A U Street community event as the public dataset carries it (see
 * `loadPublicDataset` in #lib/server/db/queries): every vetted event, searched
 * in the browser.
 */
export interface EventItem {
	// The event row's id (`event.id`). The event picker posts it so a form links
	// the very occurrence picked, not just one with the same title.
	id: number;
	title: string;
	date: string | null;
	time: string | null;
	location: string | null;
	description: string | null;
	// Event hosts/organisers (mirrors artefact provenance on the archive page).
	hosts: string[];
	url: string | null;
	/**
	 * The photograph or artefact page the event features (see
	 * #lib/server/eventFeatures), null when it has none. Optional because a
	 * blob cached before feature images existed arrives without it.
	 */
	featureImage?: FeatureImage | null;
}
