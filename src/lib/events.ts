/**
 * A U Street community event, normalised from the static source export
 * (src/lib/data/seed-data.json). Loaded + searched server-side only
 * (see $lib/server/events); the client never receives the full 1300+ list.
 */
export interface EventItem {
	// Stable id = index in the source export (order never changes).
	id: number;
	title: string;
	date: string | null;
	time: string | null;
	location: string | null;
	description: string | null;
	// Event hosts/organisers (mirrors artefact provenance on the archive page).
	hosts: string[];
	url: string | null;
}
