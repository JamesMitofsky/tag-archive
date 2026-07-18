/**
 * Imports the archive (data/artefacts.json) into the event, provenance,
 * artefact and artefactProvenance tables of the DB in DATABASE_URL.
 *
 * Unlike `db:seed` (local-only, also creates test accounts), this is meant to
 * populate PRODUCTION after a fresh migrate. It never touches the auth tables
 * (user/session/account/verification) — real accounts are created via the
 * email-OTP flow, not seeded.
 *
 * Safe by default: writing to a remote (libsql:// / https://) DB requires an
 * explicit IMPORT_CONFIRM=1 so a stray env can't rewrite production by
 * accident. Idempotent — clears only the four archive tables, then reinserts.
 *
 * Standalone (no SvelteKit `$env`) so it runs under tsx:
 *   DATABASE_URL='libsql://...' DATABASE_AUTH_TOKEN='...' IMPORT_CONFIRM=1 pnpm db:import
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { artefact, artefactProvenance, event, provenance } from './schema';

/** Source row shape: the export still carries `event` and `provenance` as free text. */
type ArtefactSource = {
	id: number;
	artefact: string;
	event: string | null;
	date: string | null;
	provenance: string[];
	programArea: string[];
	description: string | null;
	fileName: string | null;
	fileUrl: string | null;
	location: string | null;
};

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const isRemote = url.startsWith('libsql://') || url.startsWith('https://');
if (isRemote && process.env.IMPORT_CONFIRM !== '1') {
	throw new Error(
		`Refusing to import into remote database (${url}) without IMPORT_CONFIRM=1. ` +
			`Re-run with IMPORT_CONFIRM=1 to proceed.`
	);
}

const dataPath = fileURLToPath(new URL('../../../../data/artefacts.json', import.meta.url));
const rows: ArtefactSource[] = JSON.parse(readFileSync(dataPath, 'utf-8'));

// Normalise events: one row per distinct (trimmed) name, first-seen order.
const eventNames = [
	...new Set(rows.map((r) => r.event?.trim()).filter((n): n is string => Boolean(n)))
];
const events = eventNames.map((name, i) => ({ id: i + 1, name }));
const eventIdByName = new Map(events.map((e) => [e.name, e.id]));

// Normalise provenance the same way, then rebuild the artefact↔person links.
const cleanNames = (names: string[]) => [...new Set(names.map((n) => n.trim()).filter(Boolean))];
const provNames = cleanNames(rows.flatMap((r) => r.provenance ?? []));
const provenances = provNames.map((name, i) => ({ id: i + 1, name }));
const provIdByName = new Map(provenances.map((p) => [p.name, p.id]));
const provLinks = rows.flatMap((r) =>
	cleanNames(r.provenance ?? []).map((name) => ({
		artefactId: r.id,
		provenanceId: provIdByName.get(name)!
	}))
);

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const db = drizzle(client, { schema: { artefact, artefactProvenance, event, provenance } });

// Clear only the archive tables (auth tables left untouched). Children before
// parents: the join references artefact and provenance; artefact references event.
await db.delete(artefactProvenance);
await db.delete(artefact);
await db.delete(provenance);
await db.delete(event);

if (events.length) await db.insert(event).values(events);
if (provenances.length) await db.insert(provenance).values(provenances);
await db.insert(artefact).values(
	rows.map((r) => ({
		id: r.id,
		artefact: r.artefact,
		eventId: r.event?.trim() ? (eventIdByName.get(r.event.trim()) ?? null) : null,
		date: r.date,
		programArea: r.programArea,
		description: r.description,
		fileName: r.fileName,
		fileUrl: r.fileUrl,
		location: r.location
	}))
);
if (provLinks.length) await db.insert(artefactProvenance).values(provLinks);

console.log(
	`Imported ${rows.length} artefacts, ${events.length} events, ${provenances.length} provenance people into ${url}`
);
client.close();
