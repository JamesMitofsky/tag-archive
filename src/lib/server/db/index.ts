import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

const url = env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Local dev uses a file DB (`file:...`) or a `turso dev` server (`http://...`),
// neither of which needs an auth token. Only remote Turso requires one.
const isRemote = url.startsWith('libsql://') || url.startsWith('https://');
if (isRemote && !env.DATABASE_AUTH_TOKEN) {
	throw new Error('DATABASE_AUTH_TOKEN is required for remote Turso databases');
}

const client = createClient({ url, authToken: env.DATABASE_AUTH_TOKEN });

export const db = drizzle(client, { schema });
