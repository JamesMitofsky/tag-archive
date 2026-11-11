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

describe('0009_images', () => {
	let client: Client;
	// Every table 0008 leaves behind, auth included.
	const existing = [
		'user',
		'session',
		'account',
		'verification',
		'series',
		'event',
		'event_host',
		'person',
		'artefact',
		'artefact_provenance',
		'submission_contact',
		'rate_limit',
		'nfc_tag'
	];
	const before = new Map<string, number>();

	/** A minimal image row; `set` null for an upload not yet attached. */
	const insertImage = (id: number, set: number | null, originalUrl = `https://b.test/${id}.jpg`) =>
		client.execute({
			sql: `INSERT INTO image (id, set_id, url, original_url, original_type, original_bytes, bytes, width, height)
				VALUES (?, ?, ?, ?, 'image/jpeg', 100, 50, 4, 3)`,
			args: [id, set, `https://b.test/${id}.webp`, originalUrl]
		});

	beforeAll(async () => {
		client = createClient({ url: `file:${join(work, 'replay-0009.db')}` });
		await migrateThrough(client, '0008_nfc_tags');

		await client.batch(
			[
				"INSERT INTO user (id, name, email, role) VALUES ('u1', 'Admin', 'a@example.org', 'admin')",
				"INSERT INTO session (id, expires_at, token, updated_at, user_id) VALUES ('s1', 0, 't1', 0, 'u1')",
				"INSERT INTO account (id, account_id, provider_id, user_id, updated_at) VALUES ('ac1', 'a', 'email', 'u1', 0)",
				"INSERT INTO verification (id, identifier, value, expires_at) VALUES ('v1', 'a@example.org', '123456', 0)",
				"INSERT INTO series (id, name) VALUES (1, 'Music in the Garden')",
				"INSERT INTO event (id, title, series_id, date) VALUES (1, 'Concert', 1, '2024-06-01'), (2, 'Picnic', NULL, '2024-07-01')",
				"INSERT INTO person (id, name, created_by) VALUES (1, 'Host', 'u1'), (2, 'Contributor', NULL)",
				'INSERT INTO event_host (event_id, person_id) VALUES (1, 1)',
				"INSERT INTO artefact (id, artefact, event_id, date, file_urls, proposed_addition) VALUES (1, 'Program', 1, '2024', '[\"https://b.test/scan.webp\"]', 0), (2, 'Flyer', NULL, NULL, '[]', 1)",
				'INSERT INTO artefact_provenance (artefact_id, person_id) VALUES (1, 2), (2, 2)',
				"INSERT INTO submission_contact (artefact_id, name, email) VALUES (2, 'Ada', 'ada@example.org')",
				"INSERT INTO rate_limit (key, window_start, count) VALUES ('upload-ip:abc', 0, 3)",
				"INSERT INTO nfc_tag (uid, last_counter, first_seen_at, last_seen_at) VALUES ('04A1B2C3D4E5F6', 7, 0, 0)"
			],
			'write'
		);
		for (const table of existing) before.set(table, await count(client, table));

		await migrateThrough(client, '0009_images');
	});

	afterAll(() => client.close());

	it('leaves every existing table as it was', async () => {
		for (const table of existing) {
			expect(before.get(table), table).toBeGreaterThan(0);
			expect(await count(client, table), table).toBe(before.get(table));
		}
	});

	it('takes an image set linked to an event, with its photographs and contact', async () => {
		await client.execute(
			"INSERT INTO image_set (id, description, event_id, date, created_by) VALUES (1, 'Concert photographs', 1, '2024-06-01', 'u1')"
		);
		await insertImage(1, 1);
		await insertImage(2, 1);
		await client.execute("INSERT INTO image_set_contact (set_id, name) VALUES (1, 'Ada')");

		const set = await client.execute('SELECT date_auto, proposed_addition FROM image_set');
		// New sets follow their photographs and are vetted unless the writer says otherwise.
		expect(set.rows[0]).toMatchObject({ date_auto: 1, proposed_addition: 0 });
		expect(await count(client, 'image')).toBe(2);
	});

	it('keeps an upload no set has claimed yet (set_id NULL)', async () => {
		await insertImage(3, null);
		const row = await client.execute('SELECT set_id, position FROM image WHERE id = 3');
		expect(row.rows[0]).toMatchObject({ set_id: null, position: 0 });
	});

	it('refuses a second image with the same original', async () => {
		await expect(insertImage(4, null, 'https://b.test/1.jpg')).rejects.toThrow(/UNIQUE/);
	});

	it("deletes a set's photographs and contact with it, and nothing else", async () => {
		await client.execute('DELETE FROM image_set WHERE id = 1');
		expect(await count(client, 'image_set_contact')).toBe(0);
		const left = await client.execute('SELECT id FROM image');
		expect(left.rows.map((r) => Number(r.id))).toEqual([3]);
		// The event the set pointed at stays.
		expect(await count(client, 'event')).toBe(2);
	});
});
