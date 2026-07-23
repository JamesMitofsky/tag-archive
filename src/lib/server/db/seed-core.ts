/**
 * Shared archive-seeding logic for `db:seed` (local dev only). Reads the single
 * source export (src/lib/data/seed-data.json, `{ events, artefacts }`), normalises
 * it, and rewrites the six archive tables (series, event, person, event_host,
 * artefact, artefact_provenance).
 *
 * Seeding is dev-only by design — prod is already populated and its data evolves
 * through the keeper UI, not a re-seed. `seed.ts` refuses remote DB URLs, so this
 * can never rewrite production.
 *
 * Deliberately auth-agnostic: it never touches user/session/account/verification.
 * The local seed adds test accounts on top.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { artefact, artefactProvenance, event, eventHost, person, series } from './schema';

/** Source row shape for an archive artefact (data still carries `event`/`provenance` as free text). */
export type ArtefactSource = {
	id: number;
	artefact: string;
	event: string | null;
	date: string;
	provenance: string[];
	programArea: string[];
	description: string | null;
	fileUrls: string[];
	location: string | null;
};

/** Source row shape for a U Street events export entry. */
export type EventSource = {
	title: string;
	// Curated banner this event belongs to, when several near-duplicate titles
	// are one real series (e.g. every "Music in the Garden ft. X" carries
	// `series: "Music in the Garden"`). Absent for events grouped by title alone.
	series?: string | null;
	date: string;
	time: string | null;
	location: string | null;
	description: string | null;
	hosts: string[];
	url: string | null;
	mayHaveException?: boolean;
	possibleExceptionDescription?: string;
};

/** The unified seed file: raw events + raw artefacts in one place. */
export type SeedData = { events: EventSource[]; artefacts: ArtefactSource[] };

/** Counts returned by a seed run, for the caller to log. */
export type SeedSummary = {
	artefacts: number;
	linkedArtefacts: number;
	events: number;
	series: number;
	people: number;
	hostLinks: number;
	provLinks: number;
};

/** Load + parse the single source export. Standalone so it runs under tsx. */
export function loadSeedData(): SeedData {
	const dataPath = fileURLToPath(new URL('../../data/seed-data.json', import.meta.url));
	return JSON.parse(readFileSync(dataPath, 'utf-8')) as SeedData;
}

/**
 * Wipe and repopulate the six archive tables from the source export. Idempotent.
 * Auth tables are never touched. Returns counts for logging.
 */
export async function seedArchive<S extends Record<string, unknown>>(
	db: LibSQLDatabase<S>
): Promise<SeedSummary> {
	const { events: eventRows, artefacts: rows } = loadSeedData();

	// Events: one row per events-export entry (a real, dated happening). Ids follow
	// source order so links below can address them by index.
	const cleanTitle = (t: string) => t.trim();
	const eventTitles = eventRows.map((e) => cleanTitle(e.title));

	// Series: events group under a banner by their series KEY — the export's
	// explicit `series` field when set (curated consolidation of near-duplicate
	// titles), else the event's own title. A banner exists only when a key covers
	// at least 5 events; keys with 4 or fewer stay one-offs (seriesId null).
	// Case-sensitive by design — near-duplicate titles are merged deliberately via
	// `series`, never silently. Event titles are preserved as-is; only the banner
	// is shared.
	const seriesKeys = eventRows.map((e, i) => e.series?.trim() || eventTitles[i]);
	const seriesKeyCounts = new Map<string, number>();
	for (const k of seriesKeys) seriesKeyCounts.set(k, (seriesKeyCounts.get(k) ?? 0) + 1);
	const seriesNames = [...new Set(seriesKeys.filter((k) => seriesKeyCounts.get(k)! >= 5))];
	const seriesRows = seriesNames.map((name, i) => ({ id: i + 1, name }));
	const seriesIdByName = new Map(seriesRows.map((s) => [s.name, s.id]));

	// Title counts stay title-based: artefact→event linking below resolves by an
	// event's own title, independent of any series banner.
	const titleCounts = new Map<string, number>();
	for (const t of eventTitles) titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);

	const events = eventRows.map((e, i) => {
		const title = eventTitles[i];
		return {
			id: i + 1,
			title,
			// Null for a one-off; set when this event's series key recurs (a real series).
			seriesId: seriesIdByName.get(seriesKeys[i]) ?? null,
			date: e.date,
			time: e.time ?? null,
			location: e.location ?? null,
			description: e.description ?? null,
			url: e.url ?? null,
			mayHaveException: e.mayHaveException ?? false,
			possibleExceptionDescription: e.possibleExceptionDescription ?? null
		};
	});

	// Lookups for linking artefacts to a specific event by its title (see below):
	// a title that maps to exactly one event resolves unambiguously; a recurring
	// title resolves only when the artefact's date pins one of the events.
	const eventIdByUniqueTitle = new Map<string, number>();
	const eventIdByTitleDate = new Map<string, number>();
	for (const e of events) {
		eventIdByTitleDate.set(`${e.title} ${e.date}`, e.id);
		if (titleCounts.get(e.title) === 1) eventIdByUniqueTitle.set(e.title, e.id);
	}
	/**
	 * The event an artefact came from, or null when it can't be pinned:
	 * - unique title → that event
	 * - recurring title + a date that matches one event → that event
	 * - recurring title without a matching date, or a title absent from the events
	 *   export → null (needs a manual link; the series is still reachable elsewhere)
	 */
	const resolveArtefactEventId = (name: string | null, date: string): number | null => {
		const title = name?.trim();
		if (!title) return null;
		const count = titleCounts.get(title) ?? 0;
		if (count === 1) return eventIdByUniqueTitle.get(title) ?? null;
		if (count >= 2 && date) return eventIdByTitleDate.get(`${title} ${date}`) ?? null;
		return null;
	};

	// People are canonical: one row per name, shared across roles. The set is the
	// UNION of event hosts and artefact provenance people, so someone who both hosts
	// an event and contributes an artefact resolves to a single row.
	const cleanNames = (names: string[]) => [...new Set(names.map((n) => n.trim()).filter(Boolean))];
	const personNames = [
		...new Set([
			...eventRows.flatMap((e) => cleanNames(e.hosts ?? [])),
			...rows.flatMap((r) => cleanNames(r.provenance ?? []))
		])
	];
	const persons = personNames.map((name, i) => ({ id: i + 1, name }));
	const personIdByName = new Map(persons.map((p) => [p.name, p.id]));

	// event ↔ host (person) links.
	const hostLinks = eventRows.flatMap((e, i) =>
		cleanNames(e.hosts ?? []).map((name) => ({
			eventId: i + 1,
			personId: personIdByName.get(name)!
		}))
	);
	// artefact ↔ provenance (person) links.
	const provLinks = rows.flatMap((r) =>
		cleanNames(r.provenance ?? []).map((name) => ({
			artefactId: r.id,
			personId: personIdByName.get(name)!
		}))
	);

	// Clean slate. Children before parents: the join tables reference their two
	// sides; artefact + event reference their parents (event → series, joins → person).
	await db.delete(artefactProvenance);
	await db.delete(eventHost);
	await db.delete(artefact);
	await db.delete(event);
	await db.delete(person);
	await db.delete(series);

	if (seriesRows.length) await db.insert(series).values(seriesRows);
	if (events.length) await db.insert(event).values(events);
	if (persons.length) await db.insert(person).values(persons);
	await db.insert(artefact).values(
		rows.map((r) => ({
			id: r.id,
			artefact: r.artefact,
			eventId: resolveArtefactEventId(r.event, r.date),
			date: r.date,
			programArea: r.programArea,
			description: r.description,
			fileUrls: r.fileUrls ?? [],
			location: r.location
		}))
	);
	if (provLinks.length) await db.insert(artefactProvenance).values(provLinks);
	if (hostLinks.length) await db.insert(eventHost).values(hostLinks);

	const linkedArtefacts = rows.filter(
		(r) => resolveArtefactEventId(r.event, r.date) !== null
	).length;

	return {
		artefacts: rows.length,
		linkedArtefacts,
		events: events.length,
		series: seriesRows.length,
		people: persons.length,
		hostLinks: hostLinks.length,
		provLinks: provLinks.length
	};
}
