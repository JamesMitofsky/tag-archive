import { eq, inArray } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./db/testing');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());
// Record storage deletes and cache purges instead of calling R2 and Vercel.
const deleteScan = vi.hoisted(() => vi.fn(async (_key: string) => {}));
vi.mock('./scans', async (importOriginal) => ({
	...(await importOriginal<typeof import('./scans')>()),
	deleteScan
}));
const purgeArchiveCache = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./cache', () => ({ purgeArchiveCache }));

const { migrateTestDatabase } = await import('./db/testing');
const { db } = await import('./db');
const { album, event, track, user } = await import('./db/schema');
const { approveProposed, countPendingReview, loadPublicDataset, rejectProposed, unlinkEvent } =
	await import('./db/queries');
const { referencedUrls, sweepUnattachedTracks } = await import('./uploads');
const { createAlbum, deleteAlbum, listProposedAlbums, loadAlbum, updateAlbum, STALE_REFUSAL } =
	await import('./albums');
type AlbumData = import('#lib/validation/album.ts').AlbumData;
type Actor = import('./artefacts').Actor;

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };
const KEEPER = { id: 'keeper-1', role: 'contributor', email: 'keeper@example.org' };
const asAdmin: Actor = { userId: ADMIN.id, role: ADMIN.role };
const asKeeper: Actor = { userId: KEEPER.id, role: KEEPER.role };

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ ...ADMIN, name: 'Admin' },
		{ ...KEEPER, name: 'Keeper' }
	]);
	await db.insert(event).values([{ id: 1, title: 'Solstice Concert', date: '2024-06-21' }]);
});

beforeEach(() => {
	deleteScan.mockClear();
	purgeArchiveCache.mockClear();
});

let uploads = 0;

/** A finalized, unattached track, as ./trackUploads records one. */
async function upload(userId: string, duration: number | null = 180): Promise<number> {
	uploads += 1;
	const n = String(uploads).padStart(12, '0');
	const [row] = await db
		.insert(track)
		.values({
			title: `Upload ${uploads}`,
			url: `https://bucket.test/tracks/00000000-0000-4000-8000-${n}.mp3`,
			type: 'audio/mpeg',
			bytes: 1000 + uploads,
			duration,
			originalName: `${uploads}.mp3`,
			createdBy: userId,
			updatedBy: userId
		})
		.returning({ id: track.id });
	return row.id;
}

const data = (
	tracks: { id: number; title: string }[],
	extra: Partial<AlbumData> = {}
): AlbumData => ({
	title: 'Songs from the Garden',
	artist: 'The Garden Choir',
	description: 'Recorded at the solstice',
	event: '',
	eventId: null,
	date: '2024-06',
	tracks,
	...extra
});

const trackRows = (albumId: number) =>
	db.select().from(track).where(eq(track.albumId, albumId)).orderBy(track.position);

async function versionOf(id: number): Promise<number> {
	const [row] = await db.select({ updatedAt: album.updatedAt }).from(album).where(eq(album.id, id));
	return row.updatedAt.getTime();
}

describe('createAlbum', () => {
	it('attaches the tracks in order under their given titles, vetted when an admin adds it', async () => {
		const a = await upload(ADMIN.id);
		const b = await upload(ADMIN.id);
		const result = await createAlbum(
			data(
				[
					{ id: b, title: 'Opening' },
					{ id: a, title: ' Closing ' }
				],
				{ event: 'Solstice Concert' }
			),
			asAdmin
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const loaded = await loadAlbum(result.id);
		expect(loaded?.proposedAddition).toBe(false);
		expect(loaded?.event).toBe('Solstice Concert');
		expect(loaded?.artist).toBe('The Garden Choir');
		expect(loaded?.tracks.map((t) => [t.id, t.title, t.position])).toEqual([
			[b, 'Opening', 0],
			[a, 'Closing', 1]
		]);
		expect(purgeArchiveCache).toHaveBeenCalled();
	});

	it('lands a contributor’s album as a proposed addition, without purging the public cache', async () => {
		const a = await upload(KEEPER.id);
		const result = await createAlbum(data([{ id: a, title: 'One' }]), asKeeper);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((await loadAlbum(result.id))?.proposedAddition).toBe(true);
		expect(purgeArchiveCache).not.toHaveBeenCalled();
	});

	it('refuses tracks another keeper uploaded, and creates nothing', async () => {
		const mine = await upload(ADMIN.id);
		const theirs = await upload(KEEPER.id);
		const before = (await db.select().from(album)).length;
		const result = await createAlbum(
			data([
				{ id: mine, title: 'Mine' },
				{ id: theirs, title: 'Theirs' }
			]),
			asAdmin
		);
		expect(result.ok).toBe(false);
		expect((await db.select().from(album)).length).toBe(before);
		const [row] = await db.select().from(track).where(eq(track.id, theirs));
		expect(row.albumId).toBeNull();
	});

	it('refuses a track already in another album', async () => {
		const a = await upload(ADMIN.id);
		const first = await createAlbum(data([{ id: a, title: 'First' }]), asAdmin);
		expect(first.ok).toBe(true);
		const second = await createAlbum(data([{ id: a, title: 'Again' }]), asAdmin);
		expect(second.ok).toBe(false);
	});

	it('refuses duplicate ids, untitled tracks and an unchosen date', async () => {
		const a = await upload(ADMIN.id);
		const dup = await createAlbum(
			data([
				{ id: a, title: 'A' },
				{ id: a, title: 'A again' }
			]),
			asAdmin
		);
		expect(dup.ok).toBe(false);
		expect((await createAlbum(data([{ id: a, title: '  ' }]), asAdmin)).ok).toBe(false);
		expect((await createAlbum(data([{ id: a, title: 'A' }], { date: '' }), asAdmin)).ok).toBe(
			false
		);
	});
});

describe('updateAlbum', () => {
	it('reorders, retitles, adds and removes tracks, deleting the removed ones and their files', async () => {
		const a = await upload(ADMIN.id);
		const b = await upload(ADMIN.id);
		const created = await createAlbum(
			data([
				{ id: a, title: 'A' },
				{ id: b, title: 'B' }
			]),
			asAdmin
		);
		if (!created.ok) throw new Error(created.message);
		const c = await upload(ADMIN.id);
		const [bRow] = await db.select().from(track).where(eq(track.id, b));
		deleteScan.mockClear();

		const saved = await updateAlbum(
			created.id,
			data(
				[
					{ id: c, title: 'C new' },
					{ id: a, title: 'A renamed' }
				],
				{ title: 'Renamed album', artist: '', date: null }
			),
			ADMIN.id,
			{ version: await versionOf(created.id) }
		);
		expect(saved).toEqual({ ok: true, id: created.id });

		const loaded = await loadAlbum(created.id);
		expect(loaded?.title).toBe('Renamed album');
		expect(loaded?.artist).toBeNull();
		expect(loaded?.date).toBeNull();
		expect(loaded?.tracks.map((t) => [t.id, t.title])).toEqual([
			[c, 'C new'],
			[a, 'A renamed']
		]);
		// B's row and file are gone.
		expect(await db.select().from(track).where(eq(track.id, b))).toEqual([]);
		expect(deleteScan).toHaveBeenCalledWith(bRow.url.replace('https://bucket.test/', ''));
	});

	it('refuses an edit made from an out-of-date page, changing nothing', async () => {
		const a = await upload(ADMIN.id);
		const created = await createAlbum(data([{ id: a, title: 'A' }]), asAdmin);
		if (!created.ok) throw new Error(created.message);
		const stale = await versionOf(created.id);
		const first = await updateAlbum(created.id, data([{ id: a, title: 'First save' }]), ADMIN.id, {
			version: stale
		});
		expect(first.ok).toBe(true);

		const second = await updateAlbum(
			created.id,
			data([{ id: a, title: 'Second save' }]),
			ADMIN.id,
			{ version: stale }
		);
		expect(second).toEqual({ ok: false, message: STALE_REFUSAL });
		expect((await trackRows(created.id)).map((t) => t.title)).toEqual(['First save']);
	});

	it('refuses to add another keeper’s upload', async () => {
		const a = await upload(ADMIN.id);
		const created = await createAlbum(data([{ id: a, title: 'A' }]), asAdmin);
		if (!created.ok) throw new Error(created.message);
		const theirs = await upload(KEEPER.id);
		const result = await updateAlbum(
			created.id,
			data([
				{ id: a, title: 'A' },
				{ id: theirs, title: 'Theirs' }
			]),
			ADMIN.id,
			{ version: await versionOf(created.id) }
		);
		expect(result.ok).toBe(false);
		expect((await trackRows(created.id)).map((t) => t.id)).toEqual([a]);
	});
});

describe('deleteAlbum and review', () => {
	it('deletes an album with its tracks and files, only at the version given', async () => {
		const a = await upload(ADMIN.id);
		const created = await createAlbum(data([{ id: a, title: 'A' }]), asAdmin);
		if (!created.ok) throw new Error(created.message);
		const version = await versionOf(created.id);

		expect(await deleteAlbum(created.id, { version: version - 1 })).toBe(false);
		expect(await loadAlbum(created.id)).not.toBeNull();

		deleteScan.mockClear();
		expect(await deleteAlbum(created.id, { version })).toBe(true);
		expect(await loadAlbum(created.id)).toBeNull();
		expect(await db.select().from(track).where(eq(track.id, a))).toEqual([]);
		expect(deleteScan).toHaveBeenCalledTimes(1);
	});

	it('queues a contributor’s album for review; approving publishes it, rejecting deletes it', async () => {
		const a = await upload(KEEPER.id);
		const b = await upload(KEEPER.id);
		const kept = await createAlbum(data([{ id: a, title: 'Kept' }], { title: 'Kept' }), asKeeper);
		const tossed = await createAlbum(
			data([{ id: b, title: 'Tossed' }], { title: 'Tossed' }),
			asKeeper
		);
		if (!kept.ok || !tossed.ok) throw new Error('create failed');

		const pending = (await listProposedAlbums()).map((x) => x.id);
		expect(pending).toEqual(expect.arrayContaining([kept.id, tossed.id]));
		expect((await countPendingReview()).albums).toBeGreaterThanOrEqual(2);

		await approveProposed('album', kept.id, ADMIN.id);
		await rejectProposed('album', tossed.id, ADMIN.id);

		expect((await loadAlbum(kept.id))?.proposedAddition).toBe(false);
		expect(await loadAlbum(tossed.id)).toBeNull();
		expect(await db.select().from(track).where(eq(track.id, b))).toEqual([]);

		// Rejecting never touches an album that is already vetted.
		await rejectProposed('album', kept.id, ADMIN.id);
		expect(await loadAlbum(kept.id)).not.toBeNull();
	});
});

describe('the public dataset', () => {
	it('publishes vetted albums only, each track as a whitelist of fields', async () => {
		const a = await upload(ADMIN.id, 61.5);
		const b = await upload(KEEPER.id);
		const vetted = await createAlbum(
			data([{ id: a, title: 'Public track' }], { title: 'Public album' }),
			asAdmin
		);
		const pending = await createAlbum(
			data([{ id: b, title: 'Secret track' }], { title: 'Pending album' }),
			asKeeper
		);
		if (!vetted.ok || !pending.ok) throw new Error('create failed');

		const { albums } = await loadPublicDataset();
		const published = albums.find((x) => x.id === vetted.id);
		expect(published?.tracks).toEqual([
			{ id: a, title: 'Public track', url: expect.stringContaining('/tracks/'), duration: 61.5 }
		]);
		expect(Object.keys(published ?? {}).sort()).toEqual(
			['artist', 'date', 'description', 'event', 'id', 'title', 'tracks'].sort()
		);
		expect(albums.some((x) => x.id === pending.id)).toBe(false);
	});
});

describe('around the album', () => {
	it('keeps an album, unlinked, when its event is deleted', async () => {
		await db.insert(event).values({ id: 50, title: 'Doomed Gig', date: '2023-01-01' });
		const a = await upload(ADMIN.id);
		const created = await createAlbum(
			data([{ id: a, title: 'A' }], { event: 'Doomed Gig' }),
			asAdmin
		);
		if (!created.ok) throw new Error(created.message);
		expect((await loadAlbum(created.id))?.eventId).toBe(50);

		await unlinkEvent(50, ADMIN.id);
		await db.delete(event).where(eq(event.id, 50));
		expect((await loadAlbum(created.id))?.eventId).toBeNull();
	});

	it('counts a track’s file as in use, attached or not', async () => {
		const a = await upload(ADMIN.id);
		const [row] = await db.select().from(track).where(eq(track.id, a));
		expect(await referencedUrls([row.url])).toEqual(new Set([row.url]));
	});

	it('sweeps unattached tracks older than a day, with their files, and leaves the rest', async () => {
		const old = await upload(ADMIN.id);
		const fresh = await upload(ADMIN.id);
		const attached = await upload(ADMIN.id);
		const created = await createAlbum(data([{ id: attached, title: 'Kept' }]), asAdmin);
		if (!created.ok) throw new Error(created.message);
		const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
		await db
			.update(track)
			.set({ createdAt: twoDaysAgo })
			.where(inArray(track.id, [old, attached]));

		deleteScan.mockClear();
		const swept = await sweepUnattachedTracks();
		expect(swept).toBeGreaterThanOrEqual(1);
		const left = (await db.select({ id: track.id }).from(track)).map((r) => r.id);
		expect(left).not.toContain(old);
		expect(left).toEqual(expect.arrayContaining([fresh, attached]));
		expect(deleteScan).toHaveBeenCalled();
	});
});
