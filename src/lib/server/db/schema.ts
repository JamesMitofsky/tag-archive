import { relations } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * A named garden event. Recurring events (e.g. a monthly "Music in the Garden")
 * group many artefacts across dates; one-off events link a single artefact.
 * `name` is unique so the same event always resolves to one row — recurrence is
 * then derived (multiple artefacts/dates under one event), never stored as a flag.
 */
export const event = sqliteTable('event', {
	id: integer('id').primaryKey(),
	name: text('name').notNull().unique()
});

/**
 * A contributor or source person. Normalised out of the artefact so the same
 * person resolves to one row and can be searched/reused across artefacts.
 * `name` is unique — find-or-create by name keeps it canonical.
 */
export const provenance = sqliteTable('provenance', {
	id: integer('id').primaryKey(),
	name: text('name').notNull().unique()
});

/**
 * Temperance Alley Garden (TAG) archive artefact.
 * Shape mirrors the source airtable export (data/artefacts.json), except `event`
 * and `provenance`, which are normalised into their own tables (see `eventId`
 * and the `artefactProvenance` join).
 */
export const artefact = sqliteTable('artefact', {
	id: integer('id').primaryKey(),
	// Title of the archived object, e.g. "Symphonic Steep Program".
	artefact: text('artefact').notNull(),
	// The event this artefact came from; nullable — some artefacts predate named events.
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
});

/**
 * Many-to-many link between artefacts and provenance people. An artefact has
 * several contributors; a contributor appears on many artefacts.
 */
export const artefactProvenance = sqliteTable(
	'artefact_provenance',
	{
		artefactId: integer('artefact_id')
			.notNull()
			.references(() => artefact.id, { onDelete: 'cascade' }),
		provenanceId: integer('provenance_id')
			.notNull()
			.references(() => provenance.id)
	},
	(t) => [primaryKey({ columns: [t.artefactId, t.provenanceId] })]
);

// Relations power `db.query` relational loads.
export const eventRelations = relations(event, ({ many }) => ({
	artefacts: many(artefact)
}));
export const provenanceRelations = relations(provenance, ({ many }) => ({
	artefacts: many(artefactProvenance)
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
	provenance: one(provenance, {
		fields: [artefactProvenance.provenanceId],
		references: [provenance.id]
	})
}));

export type Event = typeof event.$inferSelect;
export type NewEvent = typeof event.$inferInsert;
export type Provenance = typeof provenance.$inferSelect;
export type NewProvenance = typeof provenance.$inferInsert;
export type Artefact = typeof artefact.$inferSelect;
export type NewArtefact = typeof artefact.$inferInsert;
/**
 * Artefact as the UI reads it: event name flattened in (null when unlinked) and
 * provenance re-expanded to a plain name array from the join table.
 */
export type ArtefactWithEvent = Artefact & { event: string | null; provenance: string[] };

export * from './auth.schema';
