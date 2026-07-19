import { relations } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * A series: the banner that connects several events held under one recurring
 * name (e.g. weekly "Yoga in the Garden", monthly "Music in the Garden").
 * A series exists only when several events are connected — a one-off event has
 * no series. `name` is unique so the same banner resolves to one row; the events
 * it groups are derived from `event.seriesId`, never stored as a count/flag.
 */
export const series = sqliteTable('series', {
	id: integer('id').primaryKey(),
	name: text('name').notNull().unique(),
	// Optional blurb describing the banner; null when the series has no description.
	description: text('description'),
	// Defaults inherited by events under this banner; all null when unset.
	// `defaultDayOfWeek` is a weekday name ("Friday"), `defaultTime` a free label
	// ("6:00 PM"), `frequency` a human recurrence ("4th Friday of every month").
	defaultDayOfWeek: text('default_day_of_week'),
	defaultTime: text('default_time'),
	frequency: text('frequency')
});

/**
 * An event: a single real happening on one date. Its own date and description;
 * `seriesId` links it to a banner when it's one of several connected events,
 * and is null for a one-off. Source: the U Street community export
 * (src/lib/data/seed-data.json).
 */
export const event = sqliteTable(
	'event',
	{
		id: integer('id').primaryKey(),
		// This event's own title, e.g. "Music in the Garden ft. Yaddiya". Often shared
		// across a series, but may vary per event — series membership is `seriesId`,
		// not an exact title match (curated via the export's `series` field at seed).
		title: text('title').notNull(),
		// The series this event belongs to; null for a one-off (unconnected) event.
		seriesId: integer('series_id').references(() => series.id),
		// ISO date (YYYY-MM-DD) the event took place.
		date: text('date').notNull(),
		// Free-text time span as published, e.g. "11:00 AM – 11:30 AM". Not parsed.
		time: text('time'),
		location: text('location'),
		// Description specific to this event — distinct events in one series routinely
		// carry different text.
		description: text('description'),
		// Canonical source URL for this event.
		url: text('url'),
		// Data-quality flags from the export: the event may be a mislabelled series
		// boundary / one-off. Kept for manual review, never drives logic.
		mayHaveException: integer('may_have_exception', { mode: 'boolean' }).notNull().default(false),
		possibleExceptionDescription: text('possible_exception_description')
	},
	(t) => [
		// Covers the series list's per-banner aggregation: grouping by series_id with
		// count / min(date) / max(date) is served entirely from this index, no table
		// scan. Ordered (series_id, date) so each group's date span is an index range.
		index('event_series_date_idx').on(t.seriesId, t.date),
		// Serves the events list's `ORDER BY date DESC, id DESC` slice without sorting
		// the whole table: the leading (series_id, date) index can't answer a pure
		// date order, so the top-of-list page needs its own (date, id) index.
		index('event_date_id_idx').on(t.date, t.id)
	]
);

/**
 * A person. One canonical row per name, reused across roles: the same person can
 * be the provenance (contributor/source) of an artefact and the host of an
 * event. Roles live on the join tables (`artefactProvenance`, `eventHost`), so a
 * person is normalised once and searchable everywhere. `name` is unique —
 * find-or-create by name keeps it canonical.
 */
export const person = sqliteTable('person', {
	id: integer('id').primaryKey(),
	name: text('name').notNull().unique()
});

/**
 * Many-to-many link between events and their hosts. An event may have several
 * hosts; a person hosts many events.
 */
export const eventHost = sqliteTable(
	'event_host',
	{
		eventId: integer('event_id')
			.notNull()
			.references(() => event.id, { onDelete: 'cascade' }),
		personId: integer('person_id')
			.notNull()
			.references(() => person.id)
	},
	(t) => [primaryKey({ columns: [t.eventId, t.personId] })]
);

/**
 * Temperance Alley Garden (TAG) archive artefact.
 * Shape mirrors the source airtable export (the `artefacts` array in
 * src/lib/data/seed-data.json), except `event`
 * and `provenance`, which are normalised into their own tables (see `eventId`
 * and the `artefactProvenance` join).
 */
export const artefact = sqliteTable(
	'artefact',
	{
		id: integer('id').primaryKey(),
		// Title of the archived object, e.g. "Symphonic Steep Program".
		artefact: text('artefact').notNull(),
		// The specific event this artefact came from; nullable — some artefacts have
		// no matching event, or reference a series without pinning to one date.
		// A series is reachable transitively via the linked event's `seriesId`.
		eventId: integer('event_id').references(() => event.id),
		// ISO date (YYYY-MM-DD).
		date: text('date'),
		// TAG program area tags. Multi-value → JSON string array.
		programArea: text('program_area', { mode: 'json' }).$type<string[]>().notNull().default([]),
		description: text('description'),
		// Public URLs of the attached scan images, in display order.
		// Multi-value → JSON string array; empty when nothing is attached.
		fileUrls: text('file_urls', { mode: 'json' }).$type<string[]>().notNull().default([]),
		// Physical storage location, e.g. "Binder" / "Bin".
		location: text('location')
	},
	(t) => [
		// Serves the artefact list's `ORDER BY date DESC, id DESC`: walk the index in
		// order instead of a temp b-tree sort. Cheap now, matters once the table grows
		// to ~1k rows. Mirrors event's (date, id) index.
		index('artefact_date_id_idx').on(t.date, t.id)
	]
);

/**
 * Many-to-many link between artefacts and their provenance people. An artefact
 * has several contributors; a person is the provenance of many artefacts.
 */
export const artefactProvenance = sqliteTable(
	'artefact_provenance',
	{
		artefactId: integer('artefact_id')
			.notNull()
			.references(() => artefact.id, { onDelete: 'cascade' }),
		personId: integer('person_id')
			.notNull()
			.references(() => person.id)
	},
	(t) => [primaryKey({ columns: [t.artefactId, t.personId] })]
);

// Relations power `db.query` relational loads.
export const seriesRelations = relations(series, ({ many }) => ({
	events: many(event)
}));
export const eventRelations = relations(event, ({ one, many }) => ({
	series: one(series, { fields: [event.seriesId], references: [series.id] }),
	hosts: many(eventHost),
	artefacts: many(artefact)
}));
export const personRelations = relations(person, ({ many }) => ({
	artefacts: many(artefactProvenance),
	events: many(eventHost)
}));
export const eventHostRelations = relations(eventHost, ({ one }) => ({
	event: one(event, { fields: [eventHost.eventId], references: [event.id] }),
	person: one(person, { fields: [eventHost.personId], references: [person.id] })
}));
export const artefactRelations = relations(artefact, ({ one, many }) => ({
	event: one(event, { fields: [artefact.eventId], references: [event.id] }),
	provenance: many(artefactProvenance)
}));
export const artefactProvenanceRelations = relations(artefactProvenance, ({ one }) => ({
	artefact: one(artefact, {
		fields: [artefactProvenance.artefactId],
		references: [artefact.id]
	}),
	person: one(person, {
		fields: [artefactProvenance.personId],
		references: [person.id]
	})
}));

export type Series = typeof series.$inferSelect;
export type NewSeries = typeof series.$inferInsert;
export type Event = typeof event.$inferSelect;
export type NewEvent = typeof event.$inferInsert;
export type Person = typeof person.$inferSelect;
export type NewPerson = typeof person.$inferInsert;
export type Artefact = typeof artefact.$inferSelect;
export type NewArtefact = typeof artefact.$inferInsert;
/**
 * Artefact as the UI reads it: linked event title flattened in (null when
 * unlinked) and provenance re-expanded to a plain name array from the join table.
 */
export type ArtefactWithEvent = Artefact & { event: string | null; provenance: string[] };
/**
 * Event as the keeper list reads it: series name flattened in (null for a
 * one-off) and hosts re-expanded to a plain name array from the join table.
 */
export type EventWithMeta = Event & { series: string | null; hosts: string[] };

export * from './auth.schema';
