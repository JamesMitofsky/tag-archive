/**
 * Shared archive-seeding logic for `db:seed` (local dev only). Reads the single
 * source export (src/lib/data/seed-data.json, `{ events, artefacts }`), normalises
 * it, and rewrites the six archive tables (series, event, person, event_host,
 * artefact, artefact_provenance). Image sets are cleared: they link events by
 * id, which a re-seed reassigns, and their photographs live in the local store,
 * which every dev boot starts empty. Demo sets are seeded separately, once the
 * store is up (see ./seed-photographs).
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
import {
	artefact,
	artefactProvenance,
	event,
	eventHost,
	image,
	imageSet,
	imageSetContact,
	person,
	series
} from './schema';

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

/** A key covering at least this many events becomes a series banner. */
export const SERIES_MIN_EVENTS = 5;

/**
 * The series banner each event joins, by position, or null for a one-off.
 *
 * Events group under a banner by their series KEY — the export's explicit
 * `series` field when set (curated consolidation of near-duplicate titles),
 * else the event's own title. A banner exists only when a key covers at least
 * SERIES_MIN_EVENTS events; smaller keys stay one-offs. Case-sensitive by
 * design — near-duplicate titles are merged deliberately via `series`, never
 * silently. Event titles are preserved as-is; only the banner is shared.
 */
export function seriesBanners(events: EventSource[]): (string | null)[] {
	const keys = events.map((e) => e.series?.trim() || e.title.trim());
	const counts = new Map<string, number>();
	for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
	return keys.map((k) => (counts.get(k)! >= SERIES_MIN_EVENTS ? k : null));
}

/**
 * The event each artefact came from, as a position in `events`, or null when
 * it can't be pinned. Artefacts name their event by title (free text) and
 * carry the date of the event they came from:
 * - with a date → the event with that title on that date (the last, should two
 *   share both); a same-titled event on another date is a different event
 * - without a date → the event with that title, if exactly one event has it
 * - otherwise → null, a manual link
 */
export function artefactEventIndexes(
	events: EventSource[],
	artefacts: Pick<ArtefactSource, 'event' | 'date'>[]
): (number | null)[] {
	const titles = events.map((e) => e.title.trim());
	const titleCounts = new Map<string, number>();
	for (const t of titles) titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
	const byUniqueTitle = new Map<string, number>();
	const byTitleDate = new Map<string, number>();
	titles.forEach((t, i) => {
		byTitleDate.set(`${t} ${events[i].date}`, i);
		if (titleCounts.get(t) === 1) byUniqueTitle.set(t, i);
	});
	return artefacts.map(({ event: name, date }) => {
		const title = name?.trim();
		if (!title) return null;
		if (date) return byTitleDate.get(`${title} ${date}`) ?? null;
		return byUniqueTitle.get(title) ?? null;
	});
}

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
	const banners = seriesBanners(eventRows);
	const seriesNames = [...new Set(banners.filter((b) => b !== null))];
	const seriesRows = seriesNames.map((name, i) => ({ id: i + 1, name }));
	const seriesIdByName = new Map(seriesRows.map((s) => [s.name, s.id]));

	const events = eventRows.map((e, i) => ({
		id: i + 1,
		title: e.title.trim(),
		// Null for a one-off; set when this event's series key recurs (a real series).
		seriesId: banners[i] === null ? null : seriesIdByName.get(banners[i])!,
		date: e.date,
		time: e.time ?? null,
		location: e.location ?? null,
		description: e.description ?? null,
		url: e.url ?? null,
		mayHaveException: e.mayHaveException ?? false,
		possibleExceptionDescription: e.possibleExceptionDescription ?? null
	}));

	// Artefacts link to an event by its title (and date, for a recurring title),
	// independent of any series banner. Positions are 0-based; ids are 1-based.
	const artefactEventIds = artefactEventIndexes(eventRows, rows).map((i) =>
		i === null ? null : i + 1
	);

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
	// sides; artefact + event reference their parents (event → series, joins → person);
	// image sets reference events, and their images and contact rows reference them.
	await db.delete(image);
	await db.delete(imageSetContact);
	await db.delete(imageSet);
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
		rows.map((r, i) => ({
			id: r.id,
			artefact: r.artefact,
			eventId: artefactEventIds[i],
			date: r.date,
			programArea: r.programArea,
			description: r.description,
			fileUrls: r.fileUrls ?? [],
			location: r.location
		}))
	);
	if (provLinks.length) await db.insert(artefactProvenance).values(provLinks);
	if (hostLinks.length) await db.insert(eventHost).values(hostLinks);

	const linkedArtefacts = artefactEventIds.filter((id) => id !== null).length;

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
