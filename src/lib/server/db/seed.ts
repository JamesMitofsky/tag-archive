/**
 * Resets the LOCAL dev DB to a clean, ready-to-use state: the full archive
 * (artefacts, events, series, people) from src/lib/data/seed-data.json via
 * `seedArchive`, plus an admin and a contributor test account (accounts sign in
 * via the email-OTP flow — the code prints to the dev server console locally).
 *
 * Local-only by design: refuses remote (libsql:// / https://) URLs so a
 * misconfigured env can never wipe production. Prod is populated with the same
 * archive data via `db:import` (which never creates test accounts).
 *
 * Standalone (no SvelteKit `$env` alias) so it runs under tsx:
 *   DATABASE_URL=file:local.db pnpm db:seed
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { seedArchive } from './seed-core';
import { account, session, user, verification } from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
if (url.startsWith('libsql://') || url.startsWith('https://')) {
	throw new Error(`Refusing to seed a remote database (${url}). Seeding is local-only.`);
}

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const db = drizzle(client, { schema: { user, session, account, verification } });

// Archive data (six normalised tables) — shared with the prod importer.
const summary = await seedArchive(db);

// Auth reset is local-only: wipe the auth tables and reinstate two known test
// accounts. Prod never does this (real accounts come from the OTP flow).
await db.delete(session);
await db.delete(account);
await db.delete(verification);
await db.delete(user);

const users: (typeof user.$inferInsert)[] = [
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
	`Seeded ${summary.artefacts} artefacts (${summary.linkedArtefacts} linked to an event), ` +
		`${summary.events} events, ${summary.series} series, ${summary.people} people ` +
		`(${summary.hostLinks} host links, ${summary.provLinks} provenance links) into ${url}`
);
console.log(`Seeded users: ${users.map((u) => `${u.email} (${u.role})`).join(', ')}`);
client.close();
