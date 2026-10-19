import { eq, inArray } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./db/testing');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
// Record storage deletes and cache purges instead of calling R2 and Vercel.
const deleteScan = vi.hoisted(() => vi.fn(async (_key: string) => {}));
vi.mock('./scans', async (importOriginal) => ({
	...(await importOriginal<typeof import('./scans')>()),
	deleteScan
}));
const purgeArchiveCache = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./cache', () => ({ purgeArchiveCache }));

const { migrateTestDatabase } = await import('./db/testing');
const { client, db } = await import('./db');
const { event, image, imageSet, imageSetContact, user } = await import('./db/schema');
const { submissionPrefix } = await import('./drafts');
const { keyFromUrl } = await import('./scans');
const { approveProposed, countPendingReview, rejectProposed } = await import('./db/queries');
const {
	MAX_IMAGES_PER_SET,
	computeSetDate,
	createImageSet,
	deleteImageSet,
	listImageSets,
	listProposedImageSets,
	loadImageSet,
	updateImageSet
} = await import('./imageSets');
type ImageSetData = import('$lib/validation/imageSet').ImageSetData;
type UploadOwner = import('./imageUploads').UploadOwner;
type Image = import('./db/schema').Image;
/** Who saves a set: the actor the set is stamped with, the owner its images must belong to. */
type As = { actor: import('./artefacts').Actor; owner: UploadOwner };

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };
const KEEPER = { id: 'keeper-1', role: 'contributor', email: 'keeper@example.org' };

const asAdmin: As = {
	actor: { userId: ADMIN.id, role: ADMIN.role },
	owner: { kind: 'keeper', userId: ADMIN.id }
};
const asKeeper: As = {
	actor: { userId: KEEPER.id, role: KEEPER.role },
	owner: { kind: 'keeper', userId: KEEPER.id }
};
const DRAFT_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const OTHER_DRAFT_ID = 'BBBBBBBBBBBBBBBBBBBBBB';
const asDraft = (draftId = DRAFT_ID): As => ({
	actor: { userId: null, role: null },
	owner: { kind: 'draft', prefix: submissionPrefix(draftId) }
});

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ ...ADMIN, name: 'Admin' },
		{ ...KEEPER, name: 'Keeper' }
	]);
	await db.insert(event).values([
		{ id: 1, title: 'Vetted Concert', date: '2024-06-01' },
		{ id: 2, title: 'Pending Picnic', date: '2024-07-01', proposedAddition: true }
	]);
});

beforeEach(() => {
	deleteScan.mockClear();
	purgeArchiveCache.mockClear();
});

let uploads = 0;

/**
 * A finalized, unattached upload, as ./imageUploads records one: a keeper's
 * at the bucket root attributed to them, a draft's under its own prefix and
 * unattributed.
 */
async function upload(
	by: { userId: string } | { draft: string },
	capturedAt: string | null = null
): Promise<Image> {
	uploads++;
	const prefix = 'draft' in by ? submissionPrefix(by.draft) : '';
	// A folder per object, as ./imageKeys lays them out.
	const folder = (variant: number) =>
		`https://bucket.test/${prefix}images/00000000-0000-4000-${variant}000-${String(uploads).padStart(12, '0')}`;
	const createdBy = 'userId' in by ? by.userId : null;
	const [row] = await db
		.insert(image)
		.values({
			url: `${folder(9)}/display.webp`,
			originalUrl: `${folder(8)}/original.jpg`,
			originalType: 'image/jpeg',
			originalBytes: 1000,
			bytes: 500,
			width: 40,
			height: 30,
			capturedAt,
			metadata: { gps: { latitude: 38.9, longitude: -77 } },
			createdBy,
			updatedBy: createdBy
		})
		.returning();
	return row;
}

const byAdmin = { userId: ADMIN.id };
const byKeeper = { userId: KEEPER.id };
const byDraft = { draft: DRAFT_ID };

function form(imageIds: number[], fields: Partial<ImageSetData> = {}): ImageSetData {
	return { description: '', event: '', imageIds, date: null, dateAuto: true, ...fields };
}

/** Create a set that must succeed, returning its id. */
async function created(
	imageIds: number[],
	as: As = asAdmin,
	fields: Partial<ImageSetData> = {}
): Promise<number> {
	const result = await createImageSet(form(imageIds, fields), as.actor, as.owner);
	if (!result.ok) throw new Error(`createImageSet refused: ${result.message}`);
	return result.id;
}

async function setRow(id: number) {
	return db.select().from(imageSet).where(eq(imageSet.id, id)).get();
}

async function imageRow(id: number) {
	return db.select().from(image).where(eq(image.id, id)).get();
}

/** The version an edit page opened now would send: the set's `updated_at`, in ms. */
async function versionOf(id: number): Promise<number> {
	const row = await setRow(id);
	if (!row) throw new Error(`no image set ${id}`);
	return row.updatedAt.getTime();
}

/** Save an admin's edit from a page opened just now. */
async function edit(id: number, data: ImageSetData) {
	return updateImageSet(id, data, ADMIN.id, { version: await versionOf(id) });
}

const STALE = 'This set changed since you opened it — reload to see the latest.';

const countSets = async () => (await db.select({ id: imageSet.id }).from(imageSet)).length;
const countImages = async () => (await db.select({ id: image.id }).from(image)).length;
const keysOf = (row: Image) => [row.url, row.originalUrl].map((url) => keyFromUrl(url));
const deletedKeys = () => deleteScan.mock.calls.map(([key]) => key).sort();

describe('createImageSet', () => {
	it('attaches the images in the order given, at positions 0..n-1', async () => {
		const [a, b, c] = [await upload(byAdmin), await upload(byAdmin), await upload(byAdmin)];
		const id = await created([c.id, a.id, b.id], asAdmin, { description: '  Seed swap  ' });

		const set = await loadImageSet(id);
		expect(set?.images.map((i) => [i.id, i.position, i.setId])).toEqual([
			[c.id, 0, id],
			[a.id, 1, id],
			[b.id, 2, id]
		]);
		expect(set?.description).toBe('Seed swap');
		// Attaching re-stamps the rows by hand (raw SQL), so the audit columns must say who.
		expect((await imageRow(a.id))?.updatedBy).toBe(ADMIN.id);
	});

	it('lands vetted for an admin, purging the public cache', async () => {
		const id = await created([(await upload(byAdmin)).id], asAdmin, { description: ' \n ' });
		expect(await setRow(id)).toMatchObject({ proposedAddition: false, description: null });
		expect(purgeArchiveCache).toHaveBeenCalledOnce();
	});

	it(`takes up to ${MAX_IMAGES_PER_SET} photographs in one set`, async () => {
		const ids: number[] = [];
		for (let n = 0; n < MAX_IMAGES_PER_SET; n++) ids.push((await upload(byAdmin)).id);
		const id = await created(ids);
		expect((await loadImageSet(id))?.images.map((i) => i.id)).toEqual(ids);
	});

	it('lands proposed for a non-admin keeper and an anonymous draft, without a purge', async () => {
		const mine = await created([(await upload(byKeeper)).id], asKeeper);
		const anonymous = await created([(await upload(byDraft)).id], asDraft());

		const keeperSet = await setRow(mine);
		expect(keeperSet).toMatchObject({ proposedAddition: true, createdBy: KEEPER.id });
		const draftSet = await setRow(anonymous);
		expect(draftSet).toMatchObject({ proposedAddition: true, createdBy: null });
		expect(purgeArchiveCache).not.toHaveBeenCalled();
	});

	it('links a proposed set only to a vetted event; an admin links any', async () => {
		const pending = await created([(await upload(byDraft)).id], asDraft(), {
			event: 'Pending Picnic'
		});
		const vetted = await created([(await upload(byDraft)).id], asDraft(), {
			event: 'Vetted Concert'
		});
		const admins = await created([(await upload(byAdmin)).id], asAdmin, {
			event: 'Pending Picnic'
		});

		expect((await setRow(pending))?.eventId).toBeNull();
		expect((await setRow(vetted))?.eventId).toBe(1);
		expect((await setRow(admins))?.eventId).toBe(2);
	});

	it('dates the set by the earliest day a photograph was taken, ignoring undated ones', async () => {
		const id = await created([
			(await upload(byAdmin, '2024-06-03T10:00:00')).id,
			(await upload(byAdmin, null)).id,
			(await upload(byAdmin, '2024-06-01T23:59:59')).id,
			// Cameras with an unset clock write zeros; that's no date at all.
			(await upload(byAdmin, '0000-00-00T00:00:00')).id
		]);
		expect(await setRow(id)).toMatchObject({ date: '2024-06-01', dateAuto: true });
		expect(await computeSetDate(id)).toBe('2024-06-01');

		const undated = await created([(await upload(byAdmin)).id, (await upload(byAdmin)).id]);
		expect((await setRow(undated))?.date).toBeNull();
	});

	it("refuses images that aren't the uploader's or are already used, leaving no set behind", async () => {
		const adminUpload = await upload(byAdmin);
		const keeperUpload = await upload(byKeeper);
		const draftUpload = await upload(byDraft);
		const otherDraftUpload = await upload({ draft: OTHER_DRAFT_ID });
		const attached = await upload(byAdmin);
		await created([attached.id]);
		const sets = await countSets();

		const attempts: [number[], As][] = [
			[[keeperUpload.id], asAdmin], // another keeper's
			[[adminUpload.id, keeperUpload.id], asAdmin], // one of several
			[[draftUpload.id], asAdmin], // a contributor's, to a keeper
			[[adminUpload.id], asDraft()], // a keeper's, to a contributor
			[[otherDraftUpload.id], asDraft()], // another draft's
			[[attached.id], asAdmin], // already in a set
			[[adminUpload.id, 999_999], asAdmin], // unknown
			[[adminUpload.id, adminUpload.id], asAdmin], // twice over
			[[], asAdmin], // none at all
			[[0], asAdmin], // not ids
			[[-adminUpload.id], asAdmin],
			[[NaN], asAdmin],
			[[adminUpload.id + 0.5], asAdmin],
			// one more than a set holds (refused before any of them is read)
			[Array.from({ length: MAX_IMAGES_PER_SET + 1 }, (_, n) => adminUpload.id + n), asAdmin]
		];
		for (const [ids, as] of attempts) {
			const result = await createImageSet(form(ids), as.actor, as.owner);
			expect(result).toEqual({ ok: false, message: 'Those photographs could not be attached.' });
		}

		expect(await countSets()).toBe(sets);
		for (const row of [adminUpload, keeperUpload, draftUpload, otherDraftUpload]) {
			expect((await imageRow(row.id))?.setId).toBeNull();
		}
		expect(purgeArchiveCache).toHaveBeenCalledOnce(); // the one set that was made
	});

	it('backs out whole when another form claims an image between the check and the attach', async () => {
		const [a, shared, c] = [await upload(byAdmin), await upload(byAdmin), await upload(byAdmin)];
		const sets = await countSets();
		const images = await countImages();

		// The second save of an overlapping selection lands after this one has
		// checked its images but before it attaches them (two tabs, a double submit).
		let first: Awaited<ReturnType<typeof createImageSet>> | undefined;
		const batch = client.batch.bind(client);
		const spy = vi.spyOn(client, 'batch').mockImplementationOnce(async (...args) => {
			first = await createImageSet(form([shared.id, c.id]), asAdmin.actor, asAdmin.owner);
			return batch(...args);
		});
		const second = await createImageSet(form([a.id, shared.id]), asAdmin.actor, asAdmin.owner);
		spy.mockRestore();

		expect(first?.ok).toBe(true);
		expect(second).toEqual({ ok: false, message: 'Those photographs could not be attached.' });
		const firstId = first?.ok ? first.id : -1;
		// The first set is intact...
		expect((await loadImageSet(firstId))?.images.map((i) => i.id)).toEqual([shared.id, c.id]);
		// ...the second left no set behind, and lost no photograph: the image it
		// did attach was let go before its set was deleted (which would cascade).
		expect(await countSets()).toBe(sets + 1);
		expect(await countImages()).toBe(images);
		expect((await imageRow(a.id))?.setId).toBeNull();
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it('backs out the set without losing images when the attach itself fails', async () => {
		const a = await upload(byAdmin);
		const sets = await countSets();
		const spy = vi.spyOn(client, 'batch').mockRejectedValueOnce(new Error('connection reset'));
		await expect(createImageSet(form([a.id]), asAdmin.actor, asAdmin.owner)).rejects.toThrow(
			'connection reset'
		);
		spy.mockRestore();

		expect(await countSets()).toBe(sets);
		expect(await imageRow(a.id)).toMatchObject({ setId: null });
	});
});

describe('updateImageSet', () => {
	it('reorders, adds an owned upload, and deletes the images left out with their objects', async () => {
		const [a, b, c] = [await upload(byAdmin), await upload(byAdmin), await upload(byAdmin)];
		const id = await created([a.id, b.id, c.id]);
		const d = await upload(byAdmin);
		purgeArchiveCache.mockClear();

		const result = await edit(id, form([c.id, d.id, a.id]));
		expect(result).toEqual({ ok: true, id });

		const set = await loadImageSet(id);
		expect(set?.images.map((i) => [i.id, i.position])).toEqual([
			[c.id, 0],
			[d.id, 1],
			[a.id, 2]
		]);
		expect(await imageRow(b.id)).toBeUndefined();
		expect(deletedKeys()).toEqual(keysOf(b).sort());
		expect(purgeArchiveCache).toHaveBeenCalledOnce();
	});

	it("refuses an image that is not the editing admin's or is in another set, changing nothing", async () => {
		const [a, b] = [await upload(byAdmin), await upload(byAdmin)];
		const id = await created([a.id, b.id], asAdmin, { description: 'Before' });
		const keepers = await upload(byKeeper);
		const elsewhere = await upload(byAdmin);
		await created([elsewhere.id]);

		for (const extra of [keepers.id, elsewhere.id, 999_999]) {
			const result = await edit(id, form([b.id, extra], { description: 'After' }));
			expect(result.ok).toBe(false);
		}

		const set = await loadImageSet(id);
		expect(set?.description).toBe('Before');
		expect(set?.images.map((i) => [i.id, i.position])).toEqual([
			[a.id, 0],
			[b.id, 1]
		]);
		expect((await imageRow(keepers.id))?.setId).toBeNull();
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it('puts the set back as it was when a member left it since the edit was read', async () => {
		const [a, b, c] = [await upload(byAdmin), await upload(byAdmin), await upload(byAdmin)];
		const id = await created([a.id, b.id]);

		// A concurrent edit removes `b` between this edit's reads and its write.
		const batch = client.batch.bind(client);
		const spy = vi.spyOn(client, 'batch').mockImplementationOnce(async (...args) => {
			await db.delete(image).where(eq(image.id, b.id));
			return batch(...args);
		});
		const result = await edit(id, form([b.id, c.id, a.id]));
		spy.mockRestore();

		expect(result.ok).toBe(false);
		expect((await loadImageSet(id))?.images.map((i) => [i.id, i.position])).toEqual([[a.id, 0]]);
		expect((await imageRow(c.id))?.setId).toBeNull();
	});

	it('backs out the membership write when it fails, even if it landed', async () => {
		const [a, b, c] = [await upload(byAdmin), await upload(byAdmin), await upload(byAdmin)];
		const id = await created([a.id, b.id]);
		const before = await setRow(id);

		// The write commits, but its reply is lost: the edit can't tell, so it undoes it.
		const batch = client.batch.bind(client);
		const spy = vi.spyOn(client, 'batch').mockImplementationOnce(async (...args) => {
			await batch(...args);
			throw new Error('connection reset');
		});
		await expect(edit(id, form([c.id, b.id, a.id], { description: 'After' }))).rejects.toThrow(
			'connection reset'
		);
		spy.mockRestore();

		expect((await loadImageSet(id))?.images.map((i) => [i.id, i.position])).toEqual([
			[a.id, 0],
			[b.id, 1]
		]);
		expect((await imageRow(c.id))?.setId).toBeNull();
		expect(deleteScan).not.toHaveBeenCalled();
		// The set's own fields and version too, so the page can simply save again.
		expect(await setRow(id)).toEqual(before);
	});

	it('refuses an edit made before another save, changing and deleting nothing', async () => {
		// Admin 1 opens the edit page of a set of two...
		const [a, b] = [await upload(byAdmin), await upload(byAdmin)];
		const id = await created([a.id, b.id], asAdmin, { description: 'Before' });
		const opened = await versionOf(id);

		// ...admin 2 adds a third photograph and saves...
		const c = await upload(byAdmin);
		expect(await edit(id, form([a.id, b.id, c.id], { description: 'Before' }))).toEqual({
			ok: true,
			id
		});
		const saved = await setRow(id);
		purgeArchiveCache.mockClear();

		// ...then admin 1 fixes a typo on the page they opened, which never showed
		// it. So does a page sent with no version, or one that never was.
		const typo = form([b.id, a.id], {
			description: 'Typo fixed',
			event: 'Vetted Concert',
			dateAuto: false,
			date: '2019'
		});
		for (const version of [opened, NaN, 0]) {
			expect(await updateImageSet(id, typo, ADMIN.id, { version })).toEqual({
				ok: false,
				message: STALE
			});
		}

		expect((await loadImageSet(id))?.images.map((i) => [i.id, i.position])).toEqual([
			[a.id, 0],
			[b.id, 1],
			[c.id, 2]
		]);
		expect(await setRow(id)).toEqual(saved);
		expect(deleteScan).not.toHaveBeenCalled();
		expect(purgeArchiveCache).not.toHaveBeenCalled();
	});

	it('takes an edit made from the current version, and moves the version on', async () => {
		const a = await upload(byAdmin);
		const id = await created([a.id], asAdmin, { description: 'Before' });
		const opened = await versionOf(id);

		const result = await updateImageSet(id, form([a.id], { description: 'After' }), ADMIN.id, {
			version: opened
		});
		expect(result).toEqual({ ok: true, id });
		expect((await setRow(id))?.description).toBe('After');
		expect(await versionOf(id)).toBeGreaterThan(opened);

		// A second tab opened alongside the first can't save over it.
		const again = await updateImageSet(id, form([a.id], { description: 'Tab 2' }), ADMIN.id, {
			version: opened
		});
		expect(again).toEqual({ ok: false, message: STALE });
		expect((await setRow(id))?.description).toBe('After');
	});

	it('lets one of two saves from the same version through, even if both read before either writes', async () => {
		const [a, b, c] = [await upload(byAdmin), await upload(byAdmin), await upload(byAdmin)];
		const id = await created([a.id, b.id, c.id], asAdmin, { description: 'Before' });
		const opened = await versionOf(id);
		const [d, e] = [await upload(byAdmin), await upload(byAdmin)];

		// Tab 1 adds `d` and lands after tab 2 has read the set but before it
		// writes, so any check tab 2 made before writing would pass.
		let first: Awaited<ReturnType<typeof updateImageSet>> | undefined;
		const batch = client.batch.bind(client);
		const spy = vi.spyOn(client, 'batch').mockImplementationOnce(async (...args) => {
			first = await updateImageSet(
				id,
				form([a.id, b.id, c.id, d.id], { description: 'Tab 1' }),
				ADMIN.id,
				{ version: opened }
			);
			return batch(...args);
		});
		// Tab 2 drops `c` and adds `e`, never having seen `d`.
		const second = await updateImageSet(
			id,
			form([e.id, a.id, b.id], { description: 'Tab 2' }),
			ADMIN.id,
			{ version: opened }
		);
		spy.mockRestore();

		expect(first).toEqual({ ok: true, id });
		expect(second).toEqual({ ok: false, message: STALE });
		expect((await loadImageSet(id))?.images.map((i) => i.id)).toEqual([a.id, b.id, c.id, d.id]);
		expect((await setRow(id))?.description).toBe('Tab 1');
		expect((await imageRow(e.id))?.setId).toBeNull();
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it('writes nothing when an upload is claimed elsewhere mid-save, so the page can try again', async () => {
		const [a, b] = [await upload(byAdmin), await upload(byAdmin)];
		const id = await created([a.id], asAdmin, { description: 'Before' });
		const before = await setRow(id);

		// Another form takes `b` between this edit's checks and its write.
		const batch = client.batch.bind(client);
		const spy = vi.spyOn(client, 'batch').mockImplementationOnce(async (...args) => {
			await created([b.id]);
			return batch(...args);
		});
		const result = await edit(id, form([b.id, a.id], { description: 'After' }));
		spy.mockRestore();

		expect(result).toEqual({ ok: false, message: 'Those photographs could not be attached.' });
		expect(await setRow(id)).toEqual(before);
		expect((await loadImageSet(id))?.images.map((i) => [i.id, i.position])).toEqual([[a.id, 0]]);
		// Still at the version the page holds: without `b`, the same page saves.
		expect(await edit(id, form([a.id], { description: 'After' }))).toEqual({ ok: true, id });
	});

	it('counts an approval as a change to the set', async () => {
		const x = await upload(byDraft);
		const id = await created([x.id], asDraft(), { description: 'As sent' });
		// Opened well before the approval, whatever the clock's resolution.
		await db
			.update(imageSet)
			.set({ updatedAt: new Date(1_000) })
			.where(eq(imageSet.id, id));
		await approveProposed('imageSet', id, ADMIN.id);

		const result = await updateImageSet(id, form([x.id], { description: 'Edited' }), ADMIN.id, {
			version: 1_000
		});
		expect(result).toEqual({ ok: false, message: STALE });
		expect(await setRow(id)).toMatchObject({ description: 'As sent', proposedAddition: false });
	});

	it("keeps a contributor's photographs when an admin edits their set, which stays proposed", async () => {
		const [x, y] = [await upload(byDraft), await upload(byDraft)];
		const id = await created([x.id, y.id], asDraft());
		const mine = await upload(byAdmin);

		const result = await edit(id, form([y.id, mine.id, x.id]));
		expect(result).toEqual({ ok: true, id });
		expect((await loadImageSet(id))?.images.map((i) => i.id)).toEqual([y.id, mine.id, x.id]);
		expect((await setRow(id))?.proposedAddition).toBe(true);
	});

	it('refuses an edit of a set that is gone', async () => {
		const a = await upload(byAdmin);
		expect(await updateImageSet(999_999, form([a.id]), ADMIN.id, { version: 0 })).toEqual({
			ok: false,
			message: 'That image set no longer exists.'
		});
		expect((await imageRow(a.id))?.setId).toBeNull();
	});

	it('follows the photographs while dateAuto holds, and keeps an override — undated included', async () => {
		const id = await created([(await upload(byAdmin, '2024-05-10T09:00:00')).id]);
		const [first] = (await loadImageSet(id))!.images;
		expect((await setRow(id))?.date).toBe('2024-05-10');

		await edit(id, form([first.id], { dateAuto: false, date: '2019' }));
		expect(await setRow(id)).toMatchObject({ date: '2019', dateAuto: false });

		// An earlier photograph doesn't move an overridden date...
		const earlier = await upload(byAdmin, '2024-05-01T09:00:00');
		await edit(id, form([first.id, earlier.id], { dateAuto: false, date: '2019' }));
		expect((await setRow(id))?.date).toBe('2019');

		// ...a deliberate "no date" sticks too...
		await edit(id, form([first.id, earlier.id], { dateAuto: false, date: null }));
		expect(await setRow(id)).toMatchObject({ date: null, dateAuto: false });

		// ...and handing the date back to the photographs recomputes it.
		await edit(id, form([first.id, earlier.id], { dateAuto: true }));
		expect(await setRow(id)).toMatchObject({ date: '2024-05-01', dateAuto: true });
	});

	it('links any event, vetted or not, and refuses a malformed manual date', async () => {
		const a = await upload(byAdmin);
		const id = await created([a.id]);
		await edit(id, form([a.id], { event: 'Pending Picnic' }));
		expect(await setRow(id)).toMatchObject({ eventId: 2, updatedBy: ADMIN.id });

		const result = await edit(id, form([a.id], { dateAuto: false, date: '2024-13' }));
		expect(result.ok).toBe(false);
	});
});

describe('deleteImageSet', () => {
	it('removes the set, its image rows, its contact, and every stored object', async () => {
		const [a, b] = [await upload(byDraft), await upload(byDraft)];
		const id = await created([a.id, b.id], asDraft());
		await db.insert(imageSetContact).values({ setId: id, name: 'Ada', email: 'ada@example.org' });

		expect(await deleteImageSet(id)).toBe(true);

		expect(await setRow(id)).toBeUndefined();
		expect(
			await db
				.select()
				.from(image)
				.where(inArray(image.id, [a.id, b.id]))
		).toEqual([]);
		expect(await db.select().from(imageSetContact).where(eq(imageSetContact.setId, id))).toEqual(
			[]
		);
		expect(deletedKeys()).toEqual([...keysOf(a), ...keysOf(b)].sort());
		// A set still under review was never public: nothing to purge.
		expect(purgeArchiveCache).not.toHaveBeenCalled();

		expect(await deleteImageSet(id)).toBe(false);
	});

	it('purges the cache for a public set, and leaves one alone when asked for proposed only', async () => {
		const id = await created([(await upload(byAdmin)).id]);
		purgeArchiveCache.mockClear();

		expect(await deleteImageSet(id, { proposedOnly: true })).toBe(false);
		expect(await setRow(id)).toBeDefined();
		expect(deleteScan).not.toHaveBeenCalled();

		expect(await deleteImageSet(id)).toBe(true);
		expect(purgeArchiveCache).toHaveBeenCalledOnce();
	});
});

describe('the review queue', () => {
	it('rejecting a proposed set deletes it and its objects', async () => {
		const a = await upload(byDraft);
		const id = await created([a.id], asDraft());

		await rejectProposed('imageSet', id, ADMIN.id);

		expect(await setRow(id)).toBeUndefined();
		expect(await imageRow(a.id)).toBeUndefined();
		expect(deletedKeys()).toEqual(keysOf(a).sort());
	});

	it('approving keeps the set and vets it; a later reject leaves it alone', async () => {
		const a = await upload(byDraft);
		const id = await created([a.id], asDraft());

		await approveProposed('imageSet', id, ADMIN.id);
		expect(await setRow(id)).toMatchObject({ proposedAddition: false, updatedBy: ADMIN.id });
		expect(purgeArchiveCache).toHaveBeenCalled();

		await rejectProposed('imageSet', id, ADMIN.id);
		expect(await setRow(id)).toBeDefined();
		expect((await imageRow(a.id))?.setId).toBe(id);
		expect(deleteScan).not.toHaveBeenCalled();
	});
});

describe('listing', () => {
	it('lists every set newest first (undated last), and the proposed ones with contact', async () => {
		const older = await created([(await upload(byAdmin, '2001-01-01T00:00:00')).id]);
		const newer = await created([(await upload(byAdmin, '2030-01-01T00:00:00')).id]);
		const undated = await created([(await upload(byAdmin)).id]);
		const [x, y] = [await upload(byDraft), await upload(byDraft)];
		const proposed = await created([y.id, x.id], asDraft(), { event: 'Vetted Concert' });
		await db.insert(imageSetContact).values({ setId: proposed, name: 'Grace', email: null });

		const all = await listImageSets();
		const ids = all.map((set) => set.id);
		expect(ids[0]).toBe(newer);
		expect(ids.indexOf(older)).toBeLessThan(ids.indexOf(undated));
		// Every set's images in display order, none borrowed from another set.
		for (const set of all) {
			expect(set.images.every((i) => i.setId === set.id)).toBe(true);
			expect(set.images.map((i) => i.position)).toEqual(set.images.map((_, n) => n));
		}

		const pending = await listProposedImageSets();
		expect(pending.every((set) => set.proposedAddition)).toBe(true);
		expect(pending.find((set) => set.id === proposed)).toMatchObject({
			event: 'Vetted Concert',
			contactName: 'Grace',
			contactEmail: null,
			images: [expect.objectContaining({ id: y.id }), expect.objectContaining({ id: x.id })]
		});
		expect((await countPendingReview()).images).toBe(pending.length);

		expect(await loadImageSet(999_999)).toBeNull();
	});

	it('keeps photo metadata out of the lists, but not out of one set', async () => {
		const id = await created([(await upload(byDraft)).id], asDraft());
		const listed = [
			...(await listImageSets()).find((set) => set.id === id)!.images,
			...(await listProposedImageSets()).find((set) => set.id === id)!.images
		];
		expect(listed).toHaveLength(2);
		for (const row of listed) expect(row).not.toHaveProperty('metadata');
		const [one] = (await loadImageSet(id))!.images;
		expect(one.metadata).toEqual({ gps: { latitude: 38.9, longitude: -77 } });
	});
});
