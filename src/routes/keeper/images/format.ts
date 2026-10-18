import { formatArtefactDate } from '$lib/formatDate';
import { imageSetLabel } from '$lib/images/label';
import { formatPartialDate, isFullDate } from '$lib/partialDate';

/**
 * Display helpers for the keeper image pages: how a set's particulars and
 * description, and a photograph's capture time and file, read there. Pure, so
 * the pages share them and a spec can pin them down.
 */

/** `YYYY-MM-DD`, optionally followed by `THH:MM:SS` (see `image.capturedAt`). */
const CAPTURED_AT_RE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?$/;
/** `+02:00` style, as the metadata parser normalizes a UTC offset. */
const OFFSET_RE = /^[+-]\d{2}:\d{2}$/;

/**
 * When a photograph was taken, as its camera recorded it: "July 4, 2023 at
 * 2:05:09 PM (UTC+02:00)", or just the day when that is all it recorded. Read
 * straight from the string, never through `Date`: a capture time is a wall
 * clock with no zone, and `Date` would shift it into the viewer's. The offset
 * only says where that clock stood. Anything unexpected comes back as given.
 */
export function formatCapturedAt(capturedAt: string, offset: string | null = null): string {
	const match = CAPTURED_AT_RE.exec(capturedAt);
	if (!match || !isFullDate(match[1])) return capturedAt;

	const day = formatPartialDate(match[1]);
	const [, , hh, mm, ss] = match;
	if (hh === undefined) return day;

	const hours = Number(hh);
	// 60 seconds is a leap second, which a camera may well have recorded.
	if (hours > 23 || Number(mm) > 59 || Number(ss) > 60) return capturedAt;
	const clock = `${hours % 12 || 12}:${mm}:${ss} ${hours < 12 ? 'AM' : 'PM'}`;
	const zone = offset && OFFSET_RE.test(offset) ? ` (UTC${offset})` : '';
	return `${day} at ${clock}${zone}`;
}

/** A byte count as people read file sizes: "812 bytes", "640 KB", "4.2 MB". */
export function formatFileSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '';
	if (bytes < 1024) return bytes === 1 ? '1 byte' : `${Math.round(bytes)} bytes`;
	const kilobytes = Math.round(bytes / 1024);
	// Checked after rounding, so 1023.6 KB reads "1.0 MB", never "1024 KB".
	if (kilobytes < 1024) return `${kilobytes} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_NAMES: Record<string, string> = {
	'image/jpeg': 'JPEG',
	'image/png': 'PNG',
	'image/webp': 'WebP',
	'image/gif': 'GIF',
	'image/heic': 'HEIC'
};

/** An original's sniffed type by the name people know it by ("JPEG", "HEIC"). */
export function formatImageType(type: string): string {
	return TYPE_NAMES[type] ?? type;
}

/**
 * A set's line of particulars: its date ("Undated" when it has none), event and
 * photograph count, less whichever of those the label already borrowed (see
 * `imageSetLabel`), so the label never reads twice.
 */
export function formatSetMeta(
	set: { date: string | null; event: string | null; count: number },
	label: string
): string {
	const rest = [set.event?.trim(), imageSetLabel({ count: set.count })].filter(
		(part): part is string => !!part && part !== label
	);
	return [formatArtefactDate(set.date), ...rest].join(' · ');
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
