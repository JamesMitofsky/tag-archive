import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./db/testing');
	useTestDatabaseUrl();
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const NOW = Date.parse('2026-10-02T12:00:00Z');
const HOURS = 60 * 60 * 1000;
const OLD = new Date(NOW - 48 * HOURS);
const YOUNG = new Date(NOW - 2 * HOURS);
const deleteScan = vi.hoisted(() => vi.fn(async (_key: string) => {}));
const listScans = vi.hoisted(() => vi.fn());
vi.mock('./scans', async (importOriginal) => ({
	...(await importOriginal<typeof import('./scans')>()),
	deleteScan,
	listScans
}));

const { migrateTestDatabase } = await import('./db/testing');
const { db } = await import('./db');
const { artefact, image, imageSet } = await import('./db/schema');
const {
	deleteUnreferencedImages,
	referencedUrls,
	sweepAbandonedSubmissions,
	sweepOrphanObjects,
	sweepUnattachedImages
} = await import('./uploads');

const url = (key: string) => `https://bucket.test/${key}`;
/** Where a record written before `R2_PUBLIC_URL` moved points: same object, older base. */
const oldUrl = (key: string) => `https://pub-old.r2.dev/${key}`;

/**
 * The two object keys of photograph `n` under `prefix`, laid out as ./imageKeys
 * does: a folder each, both uuid-shaped.
 */
function photo(prefix: string, n: number) {
	const folder = (variant: number) =>
		`${prefix}images/00000000-0000-4000-${variant}000-${String(n).padStart(12, '0')}/`;
	return { display: `${folder(9)}display.webp`, original: `${folder(8)}original.jpg` };
}

const SUBMITTED_IN_SET = photo('submissions/d1/', 1);
const SUBMITTED_UNATTACHED = photo('submissions/d1/', 2);
const SUBMITTED_ORPHAN = photo('submissions/d1/', 3);
const KEEPER_IN_SET = photo('', 4);
const KEEPER_STALE_UNATTACHED = photo('', 5);
const KEEPER_FRESH_UNATTACHED = photo('', 6);
const KEEPER_ORPHAN = photo('', 7);
const KEEPER_FRESH_ORPHAN = photo('', 8);
const KEEPER_MOVED = photo('', 9);
// A LIKE wildcard in the key (the only one a plain key can hold): it must match only itself.
const SUBMITTED_MOVED_SCAN = 'submissions/d1/moved_100.webp';

/** Both objects of `p`, as a bucket listing reports them. */
const listed = (p: { display: string; original: string }, lastModified: Date) => [
	{ key: p.display, lastModified },
	{ key: p.original, lastModified }
];

const deletedKeys = () => deleteScan.mock.calls.map(([key]) => key).sort();

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(artefact).values({
		artefact: 'Submitted',
		date: '2024',
		proposedAddition: true,
		fileUrls: [url('submissions/d1/used.webp'), oldUrl(SUBMITTED_MOVED_SCAN)]
	});
	const [set] = await db.insert(imageSet).values({}).returning({ id: imageSet.id });
	const row = (
		p: { display: string; original: string },
		setId: number | null,
		at: Date,
		base = url
	) => ({
		setId,
		url: base(p.display),
		originalUrl: base(p.original),
		originalType: 'image/jpeg' as const,
		originalBytes: 1000,
		bytes: 500,
		width: 40,
		height: 30,
		createdAt: at
	});
	await db
		.insert(image)
		.values([
			row(SUBMITTED_IN_SET, set.id, OLD),
			row(SUBMITTED_UNATTACHED, null, YOUNG),
			row(KEEPER_IN_SET, set.id, OLD),
			row(KEEPER_STALE_UNATTACHED, null, OLD),
			row(KEEPER_FRESH_UNATTACHED, null, YOUNG),
			row(KEEPER_MOVED, set.id, OLD, oldUrl)
		]);
});

beforeEach(() => {
	deleteScan.mockClear();
	listScans.mockReset();
});

describe('referencedUrls', () => {
	it("counts artefacts' file URLs and both objects of every image row, in a set or not", async () => {
		const inUse = await referencedUrls([
			url('submissions/d1/used.webp'),
			url(KEEPER_IN_SET.display),
			url(KEEPER_IN_SET.original),
			url(SUBMITTED_UNATTACHED.original),
			url(KEEPER_ORPHAN.original)
		]);
		expect([...inUse].sort()).toEqual(
			[
				url('submissions/d1/used.webp'),
				url(KEEPER_IN_SET.display),
				url(KEEPER_IN_SET.original),
				url(SUBMITTED_UNATTACHED.original)
			].sort()
		);
		expect(await referencedUrls([])).toEqual(new Set());
	});

	it('matches by the object a URL names, so a record under an older public base still counts', async () => {
		const inUse = await referencedUrls([
			url(KEEPER_MOVED.display),
			url(SUBMITTED_MOVED_SCAN),
			// Same tail as a stored key, but not on a path boundary: a different object.
			url('submissions/d1/xmoved_100.webp'),
			url('submissions/d1/movedX100.webp')
		]);
		expect([...inUse].sort()).toEqual(
			[url(KEEPER_MOVED.display), url(SUBMITTED_MOVED_SCAN)].sort()
		);
	});
});

describe('deleteUnreferencedImages', () => {
	it("keeps photographs' objects, deleting only what nothing uses and is ours", async () => {
		const deleted = await deleteUnreferencedImages([
			url(KEEPER_IN_SET.display),
			url(SUBMITTED_UNATTACHED.original),
			url('submissions/d1/abandoned.webp'),
			'/artefacts/legacy.jpg'
		]);
		expect(deleted).toBe(1);
		expect(deletedKeys()).toEqual(['submissions/d1/abandoned.webp']);
	});

	it('never deletes through a URL whose key climbs out of its folder', async () => {
		// As a rejected submission's `file_urls` could name them: each one's
		// bucket request would reach the vetted photograph's display copy.
		const climbs = ['%2e%2e/%2e%2e/', '.%2E/%2E./', '..\\..\\', '.\t./.\n./'];
		const deleted = await deleteUnreferencedImages(
			climbs.map((climb) => url(`submissions/d1/${climb}${KEEPER_IN_SET.display}`))
		);
		expect(deleted).toBe(0);
		expect(deleteScan).not.toHaveBeenCalled();
	});
});

describe('sweepAbandonedSubmissions', () => {
	it('deletes only old uploads that no artefact or image row uses', async () => {
		listScans.mockResolvedValue([
			{ key: 'submissions/d1/used.webp', lastModified: OLD },
			{ key: 'submissions/d1/abandoned.webp', lastModified: OLD },
			{ key: 'submissions/d2/in-progress.webp', lastModified: YOUNG },
			...listed(SUBMITTED_IN_SET, OLD),
			...listed(SUBMITTED_UNATTACHED, OLD),
			...listed(SUBMITTED_ORPHAN, OLD),
			{ key: SUBMITTED_MOVED_SCAN, lastModified: OLD },
			// Never a key the archive issues: not ours to sweep.
			{ key: 'submissions/d1/scan (1).webp', lastModified: OLD },
			{ key: 'submissions/d1/.hidden', lastModified: OLD }
		]);

		expect(await sweepAbandonedSubmissions(NOW)).toBe(3);
		expect(listScans).toHaveBeenCalledWith('submissions/');
		expect(deletedKeys()).toEqual(
			['submissions/d1/abandoned.webp', SUBMITTED_ORPHAN.display, SUBMITTED_ORPHAN.original].sort()
		);
	});
});

describe('sweepOrphanObjects', () => {
	it('deletes only old photograph objects that no image row records', async () => {
		listScans.mockResolvedValue([
			...listed(KEEPER_IN_SET, OLD),
			...listed(KEEPER_FRESH_UNATTACHED, OLD),
			...listed(KEEPER_ORPHAN, OLD),
			// Recorded under the public base the bucket was served from before.
			...listed(KEEPER_MOVED, OLD),
			// Still uploading, or about to be finalized.
			...listed(KEEPER_FRESH_ORPHAN, YOUNG),
			// Not a layout ./imageKeys writes: never ours to sweep.
			{ key: 'images/notes.txt', lastModified: OLD }
		]);

		expect(await sweepOrphanObjects(NOW)).toBe(2);
		expect(listScans).toHaveBeenCalledWith('images/');
		expect(deletedKeys()).toEqual([KEEPER_ORPHAN.display, KEEPER_ORPHAN.original].sort());
	});

	it('does nothing when nothing is old enough', async () => {
		listScans.mockResolvedValue(listed(KEEPER_FRESH_ORPHAN, YOUNG));
		expect(await sweepOrphanObjects(NOW)).toBe(0);
		expect(deleteScan).not.toHaveBeenCalled();
	});
});

// Last: it deletes rows the describes above read.
describe('sweepUnattachedImages', () => {
	it('deletes only old unattached rows, then their objects', async () => {
		expect(await sweepUnattachedImages(NOW)).toBe(1);
		expect(deletedKeys()).toEqual(
			[KEEPER_STALE_UNATTACHED.display, KEEPER_STALE_UNATTACHED.original].sort()
		);

		const left = (await db.select({ url: image.url }).from(image)).map((r) => r.url).sort();
		expect(left).toEqual(
			[
				...[SUBMITTED_IN_SET, SUBMITTED_UNATTACHED, KEEPER_IN_SET, KEEPER_FRESH_UNATTACHED].map(
					(p) => url(p.display)
				),
				oldUrl(KEEPER_MOVED.display)
			].sort()
		);

		deleteScan.mockClear();
		expect(await sweepUnattachedImages(NOW)).toBe(0);
		expect(deleteScan).not.toHaveBeenCalled();
	});
});
