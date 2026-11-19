import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./db/testing');
	useTestDatabaseUrl();
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const { migrateTestDatabase } = await import('./db/testing');
const { keyOpens } = await import('./remoteKeys');
const { db } = await import('./db');
const { remoteKey } = await import('./db/schema');

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(remoteKey).values([
		{ unlockKey: 'tobyshorin', expiresAt: '2026-12-31' },
		{ unlockKey: 'Visiting-Artist', expiresAt: '2026-12-01 18:00' },
		{ unlockKey: 'paris', expiresAt: '2026-12-01T18:00:00+01:00' }
	]);
});

const at = (iso: string) => new Date(iso);

describe('keyOpens', () => {
	it('opens for a key before it expires, and refuses one never handed out', async () => {
		expect(await keyOpens('tobyshorin', at('2026-11-18T12:00:00Z'))).toBe(true);
		expect(await keyOpens('nobody', at('2026-11-18T12:00:00Z'))).toBe(false);
	});

	it('reads a bare date as through the end of that day, UTC', async () => {
		expect(await keyOpens('tobyshorin', at('2026-12-31T23:59:59Z'))).toBe(true);
		expect(await keyOpens('tobyshorin', at('2027-01-01T00:00:00Z'))).toBe(false);
	});

	it('reads a date-time as the moment it stops, UTC unless it carries an offset', async () => {
		expect(await keyOpens('Visiting-Artist', at('2026-12-01T17:59:59Z'))).toBe(true);
		expect(await keyOpens('Visiting-Artist', at('2026-12-01T18:00:00Z'))).toBe(false);
		expect(await keyOpens('paris', at('2026-12-01T16:59:59Z'))).toBe(true);
		expect(await keyOpens('paris', at('2026-12-01T17:00:00Z'))).toBe(false);
	});

	it('matches the key in any case', async () => {
		expect(await keyOpens('TobyShorin', at('2026-11-18T12:00:00Z'))).toBe(true);
		expect(await keyOpens('visiting-artist', at('2026-11-18T12:00:00Z'))).toBe(true);
	});

	it('is not fooled by SQL LIKE wildcards', async () => {
		expect(await keyOpens('toby%', at('2026-11-18T12:00:00Z'))).toBe(false);
		expect(await keyOpens('_obyshorin', at('2026-11-18T12:00:00Z'))).toBe(false);
	});
});

describe('the remote_key table', () => {
	const insert = (unlockKey: string, expiresAt: string) =>
		db.insert(remoteKey).values({ unlockKey, expiresAt });

	it.each(['tomorrow', '31/12/2026', '2026-13-01', '1790000000000', ''])(
		'refuses an expiry SQLite cannot read as a date: %j',
		async (expiresAt) => {
			await expect(insert(`bad-expiry-${expiresAt}`, expiresAt)).rejects.toThrow();
		}
	);

	it.each(['', ' padded', 'padded '])('refuses a key it could never match: %j', async (key) => {
		await expect(insert(key, '2026-12-31')).rejects.toThrow();
	});

	it('refuses a key that differs from another only in case', async () => {
		await expect(insert('TOBYSHORIN', '2026-12-31')).rejects.toThrow();
	});
});

describe('managing keys', async () => {
	const { createKey, deleteKey, endKey, listKeys, setKeyExpiry } = await import('./remoteKeys');
	const now = at('2026-11-18T12:00:00Z');

	it('creates a key once, and refuses one differing only in case', async () => {
		expect(await createKey('managed', '2026-11-25')).toBe('created');
		expect(await createKey('MANAGED', '2026-12-25')).toBe('taken');
		expect(await keyOpens('managed', now)).toBe(true);
	});

	it('lists every key with when it ends and whether it is open, latest-closing first', async () => {
		await createKey('long-gone', '2020-01-01');
		const rows = await listKeys(now);
		const managed = rows.find((row) => row.key === 'managed');
		expect(managed).toMatchObject({ expiresAt: '2026-11-25', open: true });
		// A bare date runs through the end of that day, UTC.
		expect(managed?.endsAt).toBe(Date.parse('2026-11-26T00:00:00Z'));
		expect(rows.find((row) => row.key === 'long-gone')?.open).toBe(false);
		const ends = rows.map((row) => row.endsAt);
		expect(ends).toEqual([...ends].sort((a, b) => b - a));
	});

	it('moves an expiry, reopening a closed key', async () => {
		expect(await setKeyExpiry('long-gone', '2026-12-01')).toBe(true);
		expect(await keyOpens('long-gone', now)).toBe(true);
		expect(await setKeyExpiry('no-such-key', '2026-12-01')).toBe(false);
	});

	it('closes a key at this moment, keeping its row', async () => {
		const closing = new Date();
		expect(await endKey('long-gone', closing)).toBe(true);
		expect(await keyOpens('long-gone', new Date(closing.getTime() + 1000))).toBe(false);
		expect((await listKeys()).some((row) => row.key === 'long-gone')).toBe(true);
	});

	it('deletes a key', async () => {
		expect(await deleteKey('managed')).toBe(true);
		expect(await keyOpens('managed', now)).toBe(false);
		expect(await deleteKey('managed')).toBe(false);
	});
});
