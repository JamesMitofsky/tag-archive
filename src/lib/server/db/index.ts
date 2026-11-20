import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { DATABASE_URL, DATABASE_AUTH_TOKEN } from '$app/env/private';

const url = DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Local dev uses a file DB (`file:...`) or a `turso dev` server (`http://...`),
// neither of which needs an auth token. Only remote Turso requires one.
const isRemote = url.startsWith('libsql://') || url.startsWith('https://');
if (isRemote && !DATABASE_AUTH_TOKEN) {
	throw new Error('DATABASE_AUTH_TOKEN is required for remote Turso databases');
}

// Exported so callers that need a true atomic multi-statement write can use
// `client.batch([...], 'write')` — a single round-trip transaction with no
// held interactive stream (more robust over the libsql HTTP protocol than
// `db.transaction`).
//
// `timeout` only applies to `file:` databases (remote clients ignore it). Since
// @libsql/client 0.18 a file client pools several connections, so two
// overlapping writes contend for the file lock; without a busy timeout the
// second fails at once with SQLITE_BUSY instead of waiting its turn.
export const client = createClient({ url, authToken: DATABASE_AUTH_TOKEN, timeout: 5000 });

export const db = drizzle(client, { schema });
