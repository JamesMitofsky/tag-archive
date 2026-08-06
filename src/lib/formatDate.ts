import { formatPartialDate } from '$lib/partialDate';

// Render a date at whatever precision it carries — "July 4, 2023", "July 2023",
// or "2023"; falls back to the raw string if unparseable. See $lib/partialDate
// for why artefact dates may be truncated.
export function formatDate(value: string): string {
	return formatPartialDate(value);
}

// Shortened human-readable form — "Jul 4, 2023", "Jul 2023", "2023".
export function formatDateShort(value: string): string {
	return formatPartialDate(value, { short: true });
}
