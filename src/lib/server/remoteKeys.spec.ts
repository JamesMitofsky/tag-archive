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
