import { formatArtefactDate } from '#lib/formatDate.ts';

/**
 * How an album and its tracks read on the page: clock times, running
 * lengths, a title worked out from a file name. Pure, so every page and the
 * player share them, and a spec can pin them down.
 */

/** A clock reading: `4:05`, `1:02:09`, or `–:––` when there is none to give. */
export function formatClock(seconds: number | null | undefined): string {
	if (seconds == null || !Number.isFinite(seconds)) return '–:––';
	const s = Math.max(0, Math.floor(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const ss = String(s % 60).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A running length to the nearest minute: `42 min`, `1 hr 5 min`; under half a minute, `25 sec`. */
export function formatTotal(seconds: number): string {
	const mins = Math.round(seconds / 60);
	if (mins === 0) return `${Math.max(0, Math.round(seconds))} sec`;
	const h = Math.floor(mins / 60);
	return h ? `${h} hr ${mins % 60} min` : `${mins} min`;
}

/** The sum of every track's length, or null while any of them is still unknown. */
export function totalDuration(durations: (number | null | undefined)[]): number | null {
	if (durations.length === 0 || durations.some((d) => d == null || !Number.isFinite(d))) {
		return null;
	}
	return durations.reduce<number>((sum, d) => sum + (d as number), 0);
}

/** "1 track", "12 tracks". */
export function trackCount(count: number): string {
	return count === 1 ? '1 track' : `${count} tracks`;
}

/**
 * A track number and its separator at the start of a file name: `01 - `,
 * `3. `, `07_`, `12 `. A number with no separator after it (`1999`) is left
 * alone, since it is more likely the title than its position.
 */
const LEADING_NUMBER_RE = /^\s*\d{1,3}\s*(?:[-–—._)]+\s*|\s+)(?=\S)/;

/**
 * A first guess at a track's title from the file it came in, which the
 * keeper can change before saving: the name without its extension, its
 * leading track number or underscores. Never empty: a name that is nothing
 * but a number keeps it.
 */
export function titleFromFileName(name: string): string {
	const base = name.replace(/\.[A-Za-z0-9]{1,5}$/, '');
	const words = (raw: string) => raw.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
	return words(base.replace(LEADING_NUMBER_RE, '')) || words(base) || 'Untitled track';
}

/**
 * An album's line of particulars, as every list prints it: its date
 * ("Undated" when it has none), event, track count and running length, e.g.
 * "June 2024 · Solstice Concert · 9 tracks · 41 min". The artist has a line
 * of its own wherever an album is shown, so it isn't repeated here.
 */
export function albumParticulars(album: {
	date: string | null;
	event: string | null;
	tracks: { duration: number | null }[];
}): string {
	const total = totalDuration(album.tracks.map((t) => t.duration));
	return [
		formatArtefactDate(album.date),
		album.event?.trim(),
		trackCount(album.tracks.length),
		total != null ? formatTotal(total) : null
	]
		.filter((part): part is string => !!part)
		.join(' · ');
}
