/**
 * Imports the full archive (artefacts, events, series, people) from
 * src/lib/data/seed-data.json into their DB tables via the shared `seedArchive`.
 *
 * Unlike `db:seed` (local-only, also creates test accounts), this is meant to
 * populate PRODUCTION after a fresh migrate. It never touches the auth tables
 * (user/session/account/verification) — real accounts are created via the
 * email-OTP flow, not seeded.
 *
 * Safe by default: writing to a remote (libsql:// / https://) DB requires an
 * explicit IMPORT_CONFIRM=1 so a stray env can't rewrite production by
 * accident. Idempotent — clears only the six archive tables, then reinserts.
 *
 * Standalone (no SvelteKit `$env`) so it runs under tsx:
 *   DATABASE_URL='libsql://...' DATABASE_AUTH_TOKEN='...' IMPORT_CONFIRM=1 pnpm db:import
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { seedArchive } from './seed-core';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const isRemote = url.startsWith('libsql://') || url.startsWith('https://');
if (isRemote && process.env.IMPORT_CONFIRM !== '1') {
	throw new Error(
		`Refusing to import into remote database (${url}) without IMPORT_CONFIRM=1. ` +
			`Re-run with IMPORT_CONFIRM=1 to proceed.`
	);
}

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const db = drizzle(client);

const summary = await seedArchive(db);

console.log(
	`Imported ${summary.artefacts} artefacts (${summary.linkedArtefacts} linked to an event), ` +
		`${summary.events} events, ${summary.series} series, ${summary.people} people ` +
		`(${summary.hostLinks} host links, ${summary.provLinks} provenance links) into ${url}`
);
client.close();
