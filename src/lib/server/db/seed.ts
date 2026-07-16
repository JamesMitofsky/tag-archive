/**
 * Seeds the local DB from data/artefacts.json.
 * Standalone (no SvelteKit `$env` alias) so it runs under tsx:
 *   DATABASE_URL=file:local.db pnpm db:seed
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { artefact, type NewArtefact } from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const dataPath = fileURLToPath(new URL('../../../../data/artefacts.json', import.meta.url));
const rows: NewArtefact[] = JSON.parse(readFileSync(dataPath, 'utf-8'));

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const db = drizzle(client, { schema: { artefact } });

await db.delete(artefact);
await db.insert(artefact).values(rows);

console.log(`Seeded ${rows.length} artefacts into ${url}`);
client.close();
