/**
 * Insert-only import of curated events into a live archive database.
 *
 * Unlike `seedArchive`, which wipes and rebuilds the archive tables (and so is
 * local-only), this only ever adds rows: events whose source URL the database
 * doesn't already hold, plus the series banners and host people they need.
 * Nothing existing is updated or deleted, so it is safe against production and
 * safe to re-run — a second run finds every URL already present and skips it.
 *
 * Standalone (no SvelteKit `$env`): the caller hands in the drizzle instance.
 */
import { inArray, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { EventSource } from '../db/seed-core';
import { event, eventHost, person, series } from '../db/schema';

// Any libsql drizzle instance, whatever schema it was built with.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = LibSQLDatabase<any>;

/** An entry headed for the database: every pipeline entry has a source URL. */
export type ImportEvent = EventSource & { url: string };

export type SkipReason =
	/** The database already has an event with this URL (e.g. a previous run). */
	| 'already-imported'
	/** Same title and date as an existing event under another (or no) URL. */
	| 'same-title-and-date'
	/** Dated after `today`; left for a later run unless upcoming events are allowed. */
	| 'upcoming'
	/** The same URL appears earlier in the file. */
	| 'repeated-in-file';

export type ImportPlan = {
	insert: ImportEvent[];
	skipped: { event: ImportEvent; reason: SkipReason }[];
	/** Series banner each inserted event joins, by URL; null for a one-off. */
	seriesByUrl: Map<string, string | null>;
	/** Banners named by the file that don't exist yet; the import creates them. */
	newSeries: string[];
	/** Host names with no person row yet; the import creates them. */
	newPeople: string[];
};

export type PlanOptions = {
	/** ISO date; events after it count as upcoming. */
	today: string;
	includeUpcoming: boolean;
};

const unique = (values: string[]) => [...new Set(values.map((v) => v.trim()).filter(Boolean))];

/**
 * Decide what an import would do, without writing anything.
 *
 * Series follow the seed's rules, applied against what the database holds now:
 * an entry's explicit `series` names its banner (created if missing); without
 * one, the event joins the banner named exactly like its title when that
 * banner exists; otherwise it stays a one-off.
 */
export async function planImport(
	db: Db,
	events: ImportEvent[],
	options: PlanOptions
): Promise<ImportPlan> {
	const existing = await db
		.select({ title: event.title, date: event.date, url: event.url })
		.from(event);
	const existingUrls = new Set(existing.map((e) => e.url).filter(Boolean));
	const existingTitleDates = new Set(existing.map((e) => `${e.title.trim()}\u0000${e.date}`));
	const seriesNames = new Set(
		(await db.select({ name: series.name }).from(series)).map((s) => s.name)
	);

	const insert: ImportEvent[] = [];
	const skipped: ImportPlan['skipped'] = [];
	const seen = new Set<string>();
	for (const e of events) {
		let reason: SkipReason | null = null;
		if (seen.has(e.url)) reason = 'repeated-in-file';
		else if (existingUrls.has(e.url)) reason = 'already-imported';
		else if (existingTitleDates.has(`${e.title.trim()}\u0000${e.date}`)) {
			reason = 'same-title-and-date';
		} else if (!options.includeUpcoming && e.date > options.today) reason = 'upcoming';
		seen.add(e.url);
		if (reason) skipped.push({ event: e, reason });
		else insert.push(e);
	}

	const seriesByUrl = new Map<string, string | null>();
	for (const e of insert) {
		const explicit = e.series?.trim();
		const byTitle = seriesNames.has(e.title.trim()) ? e.title.trim() : null;
		seriesByUrl.set(e.url, explicit || byTitle);
	}
	const newSeries = unique([...seriesByUrl.values()].filter((s) => s !== null)).filter(
		(name) => !seriesNames.has(name)
	);

	const hostNames = unique(insert.flatMap((e) => e.hosts));
	const knownPeople = new Set<string>();
	// Chunked to stay well under SQLite's bound-parameter limit.
	for (let i = 0; i < hostNames.length; i += 500) {
		const rows = await db
			.select({ name: person.name })
			.from(person)
			.where(inArray(person.name, hostNames.slice(i, i + 500)));
		for (const row of rows) knownPeople.add(row.name);
	}
	const newPeople = hostNames.filter((name) => !knownPeople.has(name));

	return { insert, skipped, seriesByUrl, newSeries, newPeople };
}

export type ApplyOptions = {
	/**
	 * Land the events (and any new series) as proposed additions, so they wait in
	 * the keeper review queue and stay off the public site until an admin
	 * approves them. False publishes them immediately.
	 */
	proposed: boolean;
	/** The keeper the rows are attributed to; null for an unattributed system write. */
	actorId: string | null;
};

export type ImportSummary = { events: number; series: number; people: number; hostLinks: number };

/**
 * Write a plan in ONE libsql batch, which runs as a single transaction: either
 * every event, banner, person and host link lands, or none does, so a failure
 * part-way never leaves an event without its hosts. Rows reference each other
 * through subqueries on their unique keys (event URL, series and person name)
 * rather than ids read back mid-transaction.
 */
export async function applyImport(
	db: Db,
	plan: ImportPlan,
	options: ApplyOptions
): Promise<ImportSummary> {
	if (plan.insert.length === 0) return { events: 0, series: 0, people: 0, hostLinks: 0 };

	const stamp = { createdBy: options.actorId, updatedBy: options.actorId };
	const statements = [];

	if (plan.newSeries.length > 0) {
		statements.push(
			db
				.insert(series)
				.values(
					plan.newSeries.map((name) => ({ name, proposedAddition: options.proposed, ...stamp }))
				)
				.onConflictDoNothing()
		);
	}
	if (plan.newPeople.length > 0) {
		statements.push(
			db
				.insert(person)
				.values(plan.newPeople.map((name) => ({ name, ...stamp })))
				.onConflictDoNothing()
		);
	}

	let hostLinks = 0;
	for (const e of plan.insert) {
		const seriesName = plan.seriesByUrl.get(e.url) ?? null;
		statements.push(
			db.insert(event).values({
				title: e.title.trim(),
				seriesId: seriesName
					? sql`(select ${series.id} from ${series} where ${series.name} = ${seriesName})`
					: null,
				date: e.date,
				time: e.time,
				location: e.location,
				description: e.description,
				url: e.url,
				mayHaveException: e.mayHaveException ?? false,
				possibleExceptionDescription: e.mayHaveException
					? (e.possibleExceptionDescription ?? null)
					: null,
				proposedAddition: options.proposed,
				...stamp
			})
		);
		for (const host of unique(e.hosts)) {
			hostLinks++;
			statements.push(
				db.insert(eventHost).values({
					// The newest row with this URL is the one inserted just above.
					eventId: sql`(select max(${event.id}) from ${event} where ${event.url} = ${e.url})`,
					personId: sql`(select ${person.id} from ${person} where ${person.name} = ${host})`,
					...stamp
				})
			);
		}
	}

	await db.batch(statements as [(typeof statements)[number], ...typeof statements]);

	return {
		events: plan.insert.length,
		series: plan.newSeries.length,
		people: plan.newPeople.length,
		hostLinks
	};
}
