/**
 * The display label for an image set. Sets have no title of their own, so the
 * label is derived wherever one is shown: the event the photographs were taken
 * at, else the first line of the description, else a count.
 */
export function imageSetLabel(set: {
	event?: string | null;
	description?: string | null;
	images?: readonly unknown[];
	/** When the images aren't loaded, how many there are. */
	count?: number;
}): string {
	const event = set.event?.trim();
	if (event) return event;

	const firstLine = set.description
		?.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean);
	if (firstLine) return firstLine.length > 80 ? `${firstLine.slice(0, 79).trimEnd()}…` : firstLine;

	const count = set.count ?? set.images?.length ?? 0;
	return count === 1 ? '1 photograph' : `${count} photographs`;
}
