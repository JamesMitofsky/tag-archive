import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Temperance Alley Garden (TAG) archive artefact.
 * Shape mirrors the source airtable export (data/artefacts.json).
 */
export const artefact = sqliteTable('artefact', {
	id: integer('id').primaryKey(),
	// Title of the archived object, e.g. "Symphonic Steep Program".
	artefact: text('artefact').notNull(),
	// Event the artefact came from; nullable — some artefacts predate named events.
	event: text('event'),
	// ISO date (YYYY-MM-DD).
	date: text('date'),
	// Contributors/source people. Multi-value → stored as a JSON string array.
	provenance: text('provenance', { mode: 'json' }).$type<string[]>().notNull().default([]),
	// TAG program area tags. Multi-value → JSON string array.
	programArea: text('program_area', { mode: 'json' }).$type<string[]>().notNull().default([]),
	description: text('description'),
	// Attached file split from the source "File" column.
	fileName: text('file_name'),
	fileUrl: text('file_url'),
	// Physical storage location, e.g. "Binder" / "Bin".
	location: text('location')
});

export type Artefact = typeof artefact.$inferSelect;
export type NewArtefact = typeof artefact.$inferInsert;

export * from './auth.schema';
