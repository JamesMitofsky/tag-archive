/**
 * Test-only helpers for running server code against a real, migrated SQLite
 * database instead of mocks. Each spec file gets its own throwaway file DB.
 *
 * `#lib/server/db/index.ts` reads DATABASE_URL when it is first imported, so a spec must
 * set the URL before anything imports it — from `vi.hoisted`, which runs ahead
 * of the spec's imports:
 *
 *   await vi.hoisted(async () => {
 *     const { useTestDatabaseUrl } = await import('#lib/server/db/testing.ts');
 *     useTestDatabaseUrl();
 *   });
 *   // SvelteKit fills $app/env/private when the Vite config loads, before this
 *   // file sets the variables, so hand the module the live process.env instead.
 *   vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());
 *   beforeAll(migrateTestDatabase);
 *
 * Import the modules under test dynamically after that (top-level `await
 * import(...)`), so they see the mocked env.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Point DATABASE_URL at a fresh, empty SQLite file. */
export function useTestDatabaseUrl(): void {
	const dir = mkdtempSync(join(tmpdir(), 'tag-archive-test-'));
	process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;
}

/** Apply every migration in ./drizzle, exactly as production does. */
export async function migrateTestDatabase(): Promise<void> {
	const { migrate } = await import('drizzle-orm/libsql/migrator');
	const { db } = await import('./index');
	await migrate(db, { migrationsFolder: 'drizzle' });
}
