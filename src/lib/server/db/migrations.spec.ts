/**
 * Replays migrations against a populated database, the way production meets
 * them, and checks what a schema-only replay can't: that table rebuilds keep
 * every row, every link, and the AUTOINCREMENT high-water mark.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Journal = { entries: { tag: string }[] };
const journal: Journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'tag-archive-migrations-'));

/** Migrate `client` up to and including the migration tagged `throughTag`. */
async function migrateThrough(client: Client, throughTag: string): Promise<void> {
	const last = journal.entries.findIndex((e) => e.tag === throughTag);
	if (last < 0) throw new Error(`No migration tagged ${throughTag}`);
	const entries = journal.entries.slice(0, last + 1);

	const folder = join(work, `through-${last}`);
	mkdirSync(join(folder, 'meta'), { recursive: true });
	for (const { tag } of entries) copyFileSync(`drizzle/${tag}.sql`, join(folder, `${tag}.sql`));
	writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));

	await migrate(drizzle(client), { migrationsFolder: folder });
}

const count = async (client: Client, table: string) =>
	Number((await client.execute(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

describe('0006_undated_artefacts', () => {
	let client: Client;

	beforeAll(async () => {
		client = createClient({ url: `file:${join(work, 'replay.db')}` });
		await migrateThrough(client, '0005_wild_siren');

		await client.batch(
			[
				"INSERT INTO artefact (id, artefact, date) VALUES (1, 'a', '2020'), (2, 'b', '2021-07'), (3, 'c', '2022-01-02')",
				"INSERT INTO person (id, name) VALUES (1, 'p')",
				'INSERT INTO artefact_provenance (artefact_id, person_id) VALUES (1, 1), (2, 1), (3, 1)',
				// Delete the newest artefact: its id must never be issued again.
				'DELETE FROM artefact WHERE id = 3'
			],
			'write'
		);

		await migrateThrough(client, '0006_undated_artefacts');
	});

	afterAll(() => client.close());

	it('keeps every artefact and every provenance link through the rebuild', async () => {
		expect(await count(client, 'artefact')).toBe(2);
		// artefact_provenance cascades on artefact delete; a rebuild that dropped the
		// old table with foreign keys enforced would have emptied it.
		expect(await count(client, 'artefact_provenance')).toBe(2);
	});

	// Must be the first insert after the migration: any earlier insert would take
	// the reused id itself and hide the bug.
	it('never reissues the id of a deleted artefact', async () => {
		const row = await client.execute(
			"INSERT INTO artefact (artefact, date) VALUES ('next', '2024') RETURNING id"
		);
		expect(Number(row.rows[0].id)).toBeGreaterThan(3);
	});

	it('accepts an undated artefact', async () => {
		await client.execute("INSERT INTO artefact (artefact, date) VALUES ('undated', NULL)");
		const row = await client.execute("SELECT date FROM artefact WHERE artefact = 'undated'");
		expect(row.rows[0].date).toBeNull();
	});

	it('sorts undated artefacts last under the list order', async () => {
		const rows = await client.execute('SELECT artefact FROM artefact ORDER BY date DESC, id DESC');
		expect(rows.rows.at(-1)?.artefact).toBe('undated');
	});
});
