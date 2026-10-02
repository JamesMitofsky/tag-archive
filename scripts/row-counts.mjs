// Prints `table<TAB>rows` for every table in DATABASE_URL, sorted by name.
// The migration gate (migrate-test.sh) diffs this before and after applying a
// branch's pending migrations: a rebuild that silently drops rows — e.g. a
// cascade fired by DROP TABLE — applies "successfully" and only shows up here.
import { createClient } from '@libsql/client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
try {
	const tables = await client.execute(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY name"
	);
	for (const { name } of tables.rows) {
		const { rows } = await client.execute(`SELECT count(*) AS n FROM "${name}"`);
		console.log(`${name}\t${rows[0].n}`);
	}
} finally {
	client.close();
}
