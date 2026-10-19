import { isActionFailure, isHttpError, isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
// Record storage deletes and cache purges instead of calling R2 and Vercel.
const deleteScan = vi.hoisted(() => vi.fn(async (_key: string) => {}));
vi.mock('$lib/server/scans', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/scans')>()),
	deleteScan
}));
const purgeArchiveCache = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('$lib/server/cache', () => ({ purgeArchiveCache }));
// Not under test here; keep the metadata parser out of the import graph.
vi.mock('$lib/server/imageMetadata', () => ({ parseImageMetadata: vi.fn() }));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { event, image, imageSet, user } = await import('$lib/server/db/schema');
const { UNDATED } = await import('$lib/partialDate');
const { actions, load } = await import('./+page.server');

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };
const KEEPER = { id: 'keeper-1', role: 'contributor', email: 'keeper@example.org' };
type Caller = typeof ADMIN | typeof KEEPER | null;

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

/** A finalized photograph, as the upload pipeline records one: at the bucket root, attributed. */
async function photograph({
	setId = null,
	position = 0,
	capturedAt = null,
	by = ADMIN.id
}: { setId?: number | null; position?: number; capturedAt?: string | null; by?: string } = {}) {
	uploads++;
	const folder = `https://bucket.test/images/00000000-0000-4000-8000-${String(uploads).padStart(12, '0')}`;
	const [row] = await db
		.insert(image)
		.values({
			setId,
			position,
			url: `${folder}/display.webp`,
			originalUrl: `${folder}/original.jpg`,
			originalType: 'image/jpeg',
			originalBytes: 1000,
			bytes: 500,
			width: 40,
			height: 30,
			capturedAt,
			metadata: { gps: { latitude: 38.9, longitude: -77 } },
			createdBy: by,
			updatedBy: by
		})
		.returning();
	return row;
}

/** A vetted set holding photographs taken at `capturedAts`, in that order. */
async function setWith(capturedAts: (string | null)[], fields: { eventId?: number } = {}) {
	const [created] = await db
		.insert(imageSet)
		.values({ description: 'Before', date: null, createdBy: ADMIN.id, ...fields })
		.returning({ id: imageSet.id });
	const images = [];
	for (const [position, capturedAt] of capturedAts.entries()) {
		images.push(await photograph({ setId: created.id, position, capturedAt }));
	}
	return { id: created.id, images };
}

type ActionName = keyof typeof actions;

async function run(
	name: ActionName,
	id: number | string,
	fields: Record<string, string | string[]> = {},
	caller: Caller = ADMIN
) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		for (const v of Array.isArray(value) ? value : [value]) body.append(key, v);
	}
	// A save or delete sends the version its page was opened at: just now, unless
	// the test says when.
	if (!('version' in fields)) {
		const opened = await setRow(Number(id));
		if (opened) body.append('version', String(opened.updatedAt.getTime()));
	}
	const requestEvent = {
		request: new Request(`http://localhost/keeper/images/${id}/edit`, { method: 'POST', body }),
		params: { id: String(id) },
		locals: caller ? { user: caller } : {}
	};
	try {
		// The action types expect a full RequestEvent; these fields are all it reads.
		return await actions[name](requestEvent as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

async function loadAs(id: number | string, caller: Caller = ADMIN) {
	try {
		return await load({
			params: { id: String(id) },
			locals: caller ? { user: caller } : {}
		} as never);
	} catch (thrown) {
		if (isRedirect(thrown) || isHttpError(thrown)) return thrown;
		throw thrown;
	}
}

/** The form as the edit page submits it: ids in order, the date only while it's set by hand. */
const edit = (
	imageIds: number[],
	fields: {
		description?: string;
		event?: string;
		date?: string;
		dateAuto?: boolean;
		version?: number;
	} = {}
) => {
	const { dateAuto = true, date, version, ...rest } = fields;
	return {
		imageIds: imageIds.map(String),
		description: '',
		event: '',
		...rest,
		...(dateAuto ? { dateAuto: 'on' } : {}),
		...(date !== undefined ? { date } : {}),
		...(version !== undefined ? { version: String(version) } : {})
	};
};

const setRow = (id: number) => db.select().from(imageSet).where(eq(imageSet.id, id)).get();
const members = (id: number) =>
	db
		.select({ id: image.id, position: image.position })
		.from(image)
		.where(eq(image.setId, id))
		.orderBy(image.position);
const imageRow = (id: number) => db.select().from(image).where(eq(image.id, id)).get();
const keysOf = (row: { url: string; originalUrl: string }) => [
	row.url.replace('https://bucket.test/', ''),
	row.originalUrl.replace('https://bucket.test/', '')
];

describe('load', () => {
	it('bounces anyone but an admin, as artefact editing does', async () => {
		const { id } = await setWith([null]);
		const signedOut = await loadAs(id, null);
		expect(isRedirect(signedOut) && signedOut.location).toBe('/keeper');
		const keeper = await loadAs(id, KEEPER);
		expect(isRedirect(keeper) && keeper.location).toBe(`/keeper/images/${id}`);
	});

	it('404s an unknown or malformed id', async () => {
		for (const id of ['999999', 'abc', '0']) {
			const result = await loadAs(id);
			expect(isHttpError(result) && result.status).toBe(404);
		}
	});

	it('seeds the uploader with the set in order, without metadata', async () => {
		const { id, images } = await setWith(['2023-07-04T10:00:00', '2023-07-02T09:00:00']);
		const data = await loadAs(id);
		expect(data).toMatchObject({
			set: { id, description: 'Before', date: null, dateAuto: true },
			// What the photographs give, whatever the set's stored date says.
			photographDate: '2023-07-02'
		});
		const { set } = data as { set: { images: object[]; version: number } };
		// The version a save is checked against: when the set last changed, in ms.
		expect(set.version).toBe((await setRow(id))?.updatedAt.getTime());
		// Exactly what the uploader takes: no metadata, no original name or size.
		expect(set.images).toEqual(
			images.map((row) => ({
				id: row.id,
				url: row.url,
				originalUrl: row.originalUrl,
				width: 40,
				height: 30,
				capturedAt: row.capturedAt
			}))
		);
	});
});

describe('updateImageSet', () => {
	it('refuses anyone but an admin and leaves the set alone', async () => {
		const { id, images } = await setWith([null, null]);
		const ids = images.map((row) => row.id).reverse();

		const signedOut = await run('updateImageSet', id, edit(ids), null);
		expect(isActionFailure(signedOut) && signedOut.status).toBe(401);
		const keeper = await run('updateImageSet', id, edit(ids, { description: 'Mine' }), KEEPER);
		expect(isActionFailure(keeper) && keeper.status).toBe(403);

		expect((await setRow(id))?.description).toBe('Before');
		expect((await members(id)).map((row) => row.id)).toEqual(images.map((row) => row.id));
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it('saves a new order and deletes the photographs left out, rows and objects', async () => {
		const { id, images } = await setWith([null, null, null]);
		const [a, b, c] = images;

		const result = await run(
			'updateImageSet',
			id,
			edit([c.id, a.id], { description: 'After', event: 'Vetted Concert' })
		);
		expect(isRedirect(result) && result.location).toBe(`/keeper/images/${id}`);

		expect(await members(id)).toEqual([
			{ id: c.id, position: 0 },
			{ id: a.id, position: 1 }
		]);
		expect(await imageRow(b.id)).toBeUndefined();
		expect(deleteScan.mock.calls.map(([key]) => key).sort()).toEqual(keysOf(b).sort());
		expect(await setRow(id)).toMatchObject({
			description: 'After',
			eventId: 1,
			updatedBy: ADMIN.id
		});
		expect(purgeArchiveCache).toHaveBeenCalled();
	});

	it("attaches the admin's own new upload, and refuses someone else's", async () => {
		const { id, images } = await setWith([null]);
		const mine = await photograph();
		const theirs = await photograph({ by: KEEPER.id });

		const refused = await run(
			'updateImageSet',
			id,
			edit([images[0].id, theirs.id], { event: 'x' })
		);
		expect(isActionFailure(refused) && refused.status).toBe(400);
		// The form comes back as it was sent.
		expect(isActionFailure(refused) && refused.data).toMatchObject({
			setError: 'Those photographs could not be attached.',
			values: { event: 'x', dateAuto: true }
		});
		expect((await imageRow(theirs.id))?.setId).toBeNull();
		expect((await members(id)).map((row) => row.id)).toEqual([images[0].id]);

		const saved = await run('updateImageSet', id, edit([mine.id, images[0].id]));
		expect(isRedirect(saved)).toBe(true);
		expect((await members(id)).map((row) => row.id)).toEqual([mine.id, images[0].id]);
	});

	it('keeps a hand-set date, undated included, until the photographs take it back', async () => {
		const { id, images } = await setWith(['2023-07-04T10:00:00', '2023-07-02T09:00:00']);
		const ids = images.map((row) => row.id);

		await run('updateImageSet', id, edit(ids, { dateAuto: false, date: '2019-07' }));
		expect(await setRow(id)).toMatchObject({ date: '2019-07', dateAuto: false });

		// Removing the earliest photograph doesn't move a hand-set date.
		await run('updateImageSet', id, edit([ids[0]], { dateAuto: false, date: '2019-07' }));
		expect(await setRow(id)).toMatchObject({ date: '2019-07', dateAuto: false });

		// "No date" is an answer too, even though the photographs have one.
		await run('updateImageSet', id, edit([ids[0]], { dateAuto: false, date: UNDATED }));
		expect(await setRow(id)).toMatchObject({ date: null, dateAuto: false });

		// Back to following the photographs: whatever date the form still holds is ignored.
		await run('updateImageSet', id, edit([ids[0]], { date: '1999' }));
		expect(await setRow(id)).toMatchObject({ date: '2023-07-04', dateAuto: true });
	});

	it('refuses a hand-set date left blank or invalid, echoing the form', async () => {
		const { id, images } = await setWith(['2023-07-04T10:00:00']);
		const ids = images.map((row) => row.id);

		for (const date of ['', '2023-02-30']) {
			const result = await run(
				'updateImageSet',
				id,
				edit(ids, { dateAuto: false, date, description: 'Kept' })
			);
			expect(isActionFailure(result) && result.status).toBe(400);
			expect(isActionFailure(result) && result.data).toMatchObject({
				errors: { date: expect.any(Array) },
				values: { description: 'Kept', date, dateAuto: false }
			});
		}
		expect(await setRow(id)).toMatchObject({ description: 'Before', dateAuto: true });
	});

	it('refuses a set emptied of photographs', async () => {
		const { id, images } = await setWith([null]);
		const result = await run('updateImageSet', id, edit([]));
		expect(isActionFailure(result) && result.status).toBe(400);
		expect(isActionFailure(result) && result.data).toMatchObject({
			errors: { imageIds: expect.any(Array) }
		});
		expect(await imageRow(images[0].id)).toBeDefined();
	});

	it('refuses a save from a page opened before another save, keeping what was typed', async () => {
		const { id, images } = await setWith([null, null]);
		const [a, b] = images;
		const { set: opened } = (await loadAs(id)) as { set: { version: number } };

		// Someone else adds a photograph and saves meanwhile.
		const c = await photograph();
		expect(isRedirect(await run('updateImageSet', id, edit([a.id, b.id, c.id])))).toBe(true);
		const saved = await setRow(id);

		// The page opened first never showed it, so must not save over it.
		const result = await run(
			'updateImageSet',
			id,
			edit([b.id, a.id], { description: 'Typo fixed', event: 'x', version: opened.version })
		);
		expect(isActionFailure(result) && result.status).toBe(400);
		expect(isActionFailure(result) && result.data).toMatchObject({
			setError: 'This set changed since you opened it — reload to see the latest.',
			values: { description: 'Typo fixed', event: 'x', dateAuto: true }
		});
		expect((await members(id)).map((row) => row.id)).toEqual([a.id, b.id, c.id]);
		expect(await setRow(id)).toEqual(saved);
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it('says so when the set is gone', async () => {
		const loose = await photograph();
		const result = await run('updateImageSet', 999999, edit([loose.id]));
		expect(isActionFailure(result) && result.status).toBe(400);
		expect(isActionFailure(result) && result.data).toMatchObject({
			setError: 'That image set no longer exists.'
		});
	});
});

describe('deleteImageSet', () => {
	it('refuses anyone but an admin', async () => {
		const { id } = await setWith([null]);
		const signedOut = await run('deleteImageSet', id, {}, null);
		expect(isActionFailure(signedOut) && signedOut.status).toBe(401);
		const keeper = await run('deleteImageSet', id, {}, KEEPER);
		expect(isActionFailure(keeper) && keeper.status).toBe(403);
		expect(await setRow(id)).toBeDefined();
	});

	it('removes the set and its photographs, rows and stored objects', async () => {
		const { id, images } = await setWith([null, null], { eventId: 1 });
		const result = await run('deleteImageSet', id);
		expect(isRedirect(result) && result.location).toBe('/keeper/images');

		expect(await setRow(id)).toBeUndefined();
		for (const row of images) expect(await imageRow(row.id)).toBeUndefined();
		expect(deleteScan.mock.calls.map(([key]) => key).sort()).toEqual(images.flatMap(keysOf).sort());
		// The event it was linked to stays.
		expect(await db.select().from(event).where(eq(event.id, 1)).get()).toBeDefined();
	});

	it('lands on the list even when the set is already gone', async () => {
		const result = await run('deleteImageSet', 999999);
		expect(isRedirect(result) && result.location).toBe('/keeper/images');
	});

	it('refuses a delete from a page opened before the set last changed, keeping everything', async () => {
		const { id, images } = await setWith([null, null]);
		const opened = (await setRow(id))!.updatedAt.getTime();
		// Another admin's save lands after this page was opened.
		await db
			.update(imageSet)
			.set({ description: 'Edited elsewhere', updatedAt: new Date(opened + 1000) })
			.where(eq(imageSet.id, id));
		deleteScan.mockClear();

		for (const version of [String(opened), '', 'not a number']) {
			const result = await run('deleteImageSet', id, { version });
			expect(isActionFailure(result) && result.status).toBe(409);
			expect(isActionFailure(result) && result.data).toEqual({
				setError: 'This set changed since you opened it — reload to see the latest.'
			});
		}
		expect(await setRow(id)).toBeDefined();
		for (const row of images) expect(await imageRow(row.id)).toBeDefined();
		expect(deleteScan).not.toHaveBeenCalled();
	});
});
