/**
 * Applies pending Drizzle migrations from ./drizzle to the database in
 * DATABASE_URL. Used by both local setup and the CI "DB Migrate" workflow.
 *
 * Why this instead of `drizzle-kit migrate`: the CLI renders a spinner and
 * swallows the underlying error on failure — CI logs showed only
 * "applying migrations..." then exit 1. Running the migrator programmatically
 * surfaces the real error (bad auth token, existing table, SQL error) so
 * failures are diagnosable.
 *
 * Standalone (no SvelteKit `$env`) so it runs under tsx in CI:
 *   DATABASE_URL=... DATABASE_AUTH_TOKEN=... pnpm db:migrate
 */
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const migrationsFolder = fileURLToPath(new URL('../../../../drizzle', import.meta.url));

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const db = drizzle(client);

try {
	await migrate(db, { migrationsFolder });
	console.log(`Migrations applied successfully to ${url}`);
} catch (err) {
	console.error(`Migration failed against ${url}:`);
	console.error(err);
	process.exitCode = 1;
} finally {
	client.close();
}
