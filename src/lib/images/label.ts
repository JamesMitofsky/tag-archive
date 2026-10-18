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

/**
 * A set's description less its first line when that line is already showing
 * as the set's label (see `imageSetLabel`), so a page never prints it twice. A
 * first line too long for a label is shortened there, so it no longer matches
 * and the description keeps it, in full. Null when nothing is left to print.
 */
export function withoutTitleLine(description: string | null, title: string): string | null {
	if (!description) return null;
	const lines = description.split(/\r?\n/);
	const first = lines.findIndex((line) => line.trim());
	// Blank throughout: nothing to print, rather than an empty paragraph.
	if (first === -1) return null;
	if (lines[first].trim() !== title) return description;
	return (
		lines
			.slice(first + 1)
			.join('\n')
			.trim() || null
	);
}
