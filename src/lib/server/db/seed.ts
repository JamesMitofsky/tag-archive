/**
 * Resets the LOCAL dev DB to a clean, ready-to-use state:
 * artefacts from data/artefacts.json, plus an admin and a contributor account
 * (accounts sign in via the email-OTP flow — the code prints to the dev
 * server console locally).
 *
 * Local-only by design: refuses remote (libsql:// / https://) URLs so a
 * misconfigured env can never wipe production. Remote schema changes go
 * through `db:push`; remote data is never seeded.
 *
 * Standalone (no SvelteKit `$env` alias) so it runs under tsx:
 *   DATABASE_URL=file:local.db pnpm db:seed
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import {
	account,
	artefact,
	artefactProvenance,
	event,
	provenance,
	session,
	user,
	verification
} from './schema';

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
if (url.startsWith('libsql://') || url.startsWith('https://')) {
	throw new Error(`Refusing to seed a remote database (${url}). Seeding is local-only.`);
}

const dataPath = fileURLToPath(new URL('../../../../data/artefacts.json', import.meta.url));
const rows: ArtefactSource[] = JSON.parse(readFileSync(dataPath, 'utf-8'));

// Normalise events: one row per distinct (trimmed) name, first-seen order.
// Case-sensitive by design — near-duplicates ("Sunday cleanup" vs "sunday
// cleanup") are a manual data-cleanup decision, not something to silently merge.
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
const db = drizzle(client, {
	schema: { artefact, artefactProvenance, event, provenance, user, session, account, verification }
});

// Clean slate. Children before parents: the join table references both artefact
// and provenance; artefact references event.
await db.delete(session);
await db.delete(account);
await db.delete(verification);
await db.delete(user);
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

// Known accounts for local testing. Sign in with either email on
// /cloud-keeper; the OTP prints in the dev server console.
const users = [
	{
		id: 'seed-admin',
		name: 'Test Admin',
		email: 'admin@test.com',
		emailVerified: true,
		role: 'admin'
	},
	{
		id: 'seed-contributor',
		name: 'Test Contributor',
		email: 'contributor@test.com',
		emailVerified: true,
		role: 'contributor'
	}
];
await db.insert(user).values(users);

console.log(
	`Seeded ${rows.length} artefacts, ${events.length} events, ${provenances.length} provenance people into ${url}`
);
console.log(`Seeded users: ${users.map((u) => `${u.email} (${u.role})`).join(', ')}`);
client.close();
