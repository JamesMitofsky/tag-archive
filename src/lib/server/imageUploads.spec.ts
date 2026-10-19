import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

/**
 * An in-memory bucket behind `fetchObject`, answering as S3 does: 404 → null,
 * a range → 206 with `Content-Range` (416 on an empty object), else a 200.
 * `claimedSize` makes an object report a size it doesn't hold, so oversize
 * refusals are tested without allocating 50 MB.
 */
const store = vi.hoisted(() => {
	const objects = new Map<string, { bytes: Uint8Array; claimedSize?: number }>();
	const body = (bytes: Uint8Array) => new Blob([bytes as BlobPart]);
	return {
		objects,
		/** Ignore range requests and answer 200 with the whole object, as some stores may. */
		ignoreRanges: false,
		put(key: string, bytes: Uint8Array, claimedSize?: number) {
			objects.set(key, { bytes, claimedSize });
		},
		async fetch(key: string, range?: { start: number; end: number }) {
			const object = objects.get(key);
			if (!object) return null;
			const { bytes, claimedSize = bytes.length } = object;
			if (!range || store.ignoreRanges) {
				return new Response(body(bytes), { headers: { 'content-length': String(claimedSize) } });
			}
			if (claimedSize === 0) return new Response(null, { status: 416 });
			const end = Math.min(range.end, claimedSize - 1);
			return new Response(body(bytes.slice(range.start, end + 1)), {
				status: 206,
				headers: { 'content-range': `bytes ${range.start}-${end}/${claimedSize}` }
			});
		}
	};
});
const fetchObject = vi.hoisted(() => vi.fn(store.fetch));
const deleteScan = vi.hoisted(() =>
	vi.fn(async (key: string) => {
		store.objects.delete(key);
	})
);
vi.mock('$lib/server/scans', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/scans')>()),
	fetchObject,
	deleteScan
}));

const PARSED = {
	capturedAt: '2024-06-01T14:03:09',
	capturedOffset: '+02:00',
	metadata: { exif: { Make: 'Test Camera' } }
};
const parseImageMetadata = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/imageMetadata', () => ({ parseImageMetadata }));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { image, imageSet, user } = await import('$lib/server/db/schema');
const { DRAFT_COOKIE, mintDraftToken, submissionPrefix } = await import('$lib/server/drafts');
const { imageKeys } = await import('$lib/server/imageKeys');
const {
	deleteUnattachedImage,
	finalizeImage,
	ImageUploadError,
	MAX_DISPLAY_BYTES,
	MAX_ORIGINAL_BYTES,
	readCapped,
	requestOwner
} = await import('./imageUploads');
type UploadOwner = import('./imageUploads').UploadOwner;

const KEEPER: UploadOwner = { kind: 'keeper', userId: 'keeper-1' };
const OTHER_KEEPER: UploadOwner = { kind: 'keeper', userId: 'keeper-2' };
const draftOwner = (): UploadOwner => ({
	kind: 'draft',
	prefix: submissionPrefix(mintDraftToken().draft.id)
});

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ id: 'keeper-1', name: 'Keeper One', email: 'one@example.org', role: 'admin' },
		{ id: 'keeper-2', name: 'Keeper Two', email: 'two@example.org', role: 'contributor' }
	]);
});

beforeEach(() => {
	store.objects.clear();
	store.ignoreRanges = false;
	fetchObject.mockClear();
	fetchObject.mockImplementation(store.fetch);
	deleteScan.mockClear();
	parseImageMetadata.mockReset();
	parseImageMetadata.mockResolvedValue(PARSED);
});

// --- Fixtures ---------------------------------------------------------------

/** A JPEG: its signature, then zero padding up to `size` bytes. */
function jpeg(size = 2048): Uint8Array {
	const bytes = new Uint8Array(size);
	bytes.set([0xff, 0xd8, 0xff, 0xe0]);
	return bytes;
}

/** A PNG signature, padded. */
function png(size = 2048): Uint8Array {
	const bytes = new Uint8Array(size);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	return bytes;
}

const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const le32 = (n: number) => [...le24(n), (n >>> 24) & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A RIFF chunk: FourCC, little-endian size, payload padded to an even length. */
const riffChunk = (fourCC: string, payload: number[]) => [
	...ascii(fourCC),
	...le32(payload.length),
	...payload,
	...(payload.length % 2 ? [0] : [])
];

/**
 * An extended (VP8X) WebP header naming a `width`×`height` canvas, then any
 * `extra` chunks. `trailing` bytes go after the RIFF's declared end.
 */
function webp(
	width: number,
	height: number,
	{ extra = [], trailing = [] }: { extra?: number[]; trailing?: number[] } = {}
): Uint8Array {
	const chunks = [
		...riffChunk('VP8X', [0, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]),
		...extra
	];
	return new Uint8Array([
		...ascii('RIFF'),
		...le32(4 + chunks.length),
		...ascii('WEBP'),
		...chunks,
		...trailing
	]);
}

/** Fresh keys for `owner`, with both objects stored. */
function uploaded(
	owner: UploadOwner,
	{
		original = jpeg(),
		display = webp(2560, 1707),
		type = 'image/jpeg' as const
	}: { original?: Uint8Array | null; display?: Uint8Array | null; type?: 'image/jpeg' } = {}
) {
	const keys = imageKeys(owner.kind === 'keeper' ? '' : owner.prefix, type);
	if (original) store.put(keys.originalKey, original);
	if (display) store.put(keys.displayKey, display);
	return { ...keys, name: 'IMG_0001.JPG' };
}

/** What `finalizeImage` threw, or null when it resolved. */
async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
		return null;
	} catch (e) {
		if (e instanceof ImageUploadError) return e;
		throw e;
	}
}

const rowFor = (originalKey: string) =>
	db
		.select()
		.from(image)
		.where(eq(image.originalUrl, `https://bucket.test/${originalKey}`))
		.get();

const deletedKeys = () => deleteScan.mock.calls.map(([key]) => key).sort();

// --- requestOwner -----------------------------------------------------------

describe('requestOwner', () => {
	const OPEN_PASS = { kind: 't' as const, issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER };
	const cookies = (token?: string) =>
		({ get: (name: string) => (name === DRAFT_COOKIE ? token : undefined) }) as Cookies;
	const signedIn = { id: 'keeper-1' } as App.Locals['user'];

	it('is the keeper when signed in, pass or not', () => {
		expect(requestOwner({ locals: { user: signedIn }, cookies: cookies() })).toEqual(KEEPER);
	});

	it("is the visitor's draft when they hold a pass and a valid draft cookie", () => {
		const { token, draft } = mintDraftToken();
		expect(requestOwner({ locals: { pass: OPEN_PASS }, cookies: cookies(token) })).toEqual({
			kind: 'draft',
			prefix: `submissions/${draft.id}/`
		});
	});

	it('is nobody without a pass, without a draft, or with a forged draft', () => {
		const { token } = mintDraftToken();
		expect(requestOwner({ locals: {}, cookies: cookies(token) })).toBeNull();
		expect(requestOwner({ locals: { pass: OPEN_PASS }, cookies: cookies() })).toBeNull();
		const forged = token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
		expect(requestOwner({ locals: { pass: OPEN_PASS }, cookies: cookies(forged) })).toBeNull();
	});
});

// --- readCapped ------------------------------------------------------------

describe('readCapped', () => {
	/** A body streamed in `chunks` chunks of `size` bytes, counting how many were pulled. */
	function streamed(chunks: number, size: number) {
		let pulled = 0;
		let canceled = false;
		// No high-water mark, so nothing is pulled until someone reads.
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					if (pulled === chunks) return controller.close();
					pulled++;
					controller.enqueue(new Uint8Array(size).fill(pulled));
				},
				cancel() {
					canceled = true;
				}
			},
			{ highWaterMark: 0 }
		);
		return { body, pulled: () => pulled, canceled: () => canceled };
	}

	it('reads a body within the cap, chunks joined in order', async () => {
		const { body } = streamed(3, 4);
		const bytes = await readCapped({ body, headers: new Headers() }, 12);
		expect(Array.from(bytes ?? [])).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
	});

	it('refuses a declared Content-Length over the cap without reading a byte', async () => {
		const { body, pulled, canceled } = streamed(3, 4);
		const headers = new Headers({ 'content-length': '13' });
		expect(await readCapped({ body, headers }, 12)).toBeNull();
		expect(pulled()).toBe(0);
		expect(canceled()).toBe(true);
	});

	it('stops reading an undeclared body as soon as it passes the cap', async () => {
		const { body, pulled, canceled } = streamed(1000, 4);
		expect(await readCapped({ body, headers: new Headers() }, 10)).toBeNull();
		expect(pulled()).toBeLessThan(10);
		expect(canceled()).toBe(true);
	});

	it('reads an absent body as empty', async () => {
		expect(await readCapped({ body: null, headers: new Headers() }, 10)).toEqual(new Uint8Array());
	});
});

// --- finalizeImage ----------------------------------------------------------

describe('finalizeImage', () => {
	it("records a keeper's photograph: unattached, attributed, sized from the WebP", async () => {
		const original = jpeg(4096);
		const keys = uploaded(KEEPER, { original, display: webp(2560, 1707) });

		const result = await finalizeImage({ ...keys, name: '  IMG_0001.JPG\n' }, KEEPER);

		const row = await rowFor(keys.originalKey);
		expect(row).toMatchObject({
			setId: null,
			url: `https://bucket.test/${keys.displayKey}`,
			originalUrl: `https://bucket.test/${keys.originalKey}`,
			originalType: 'image/jpeg',
			originalName: 'IMG_0001.JPG',
			originalBytes: 4096,
			bytes: 30,
			width: 2560,
			height: 1707,
			capturedAt: PARSED.capturedAt,
			capturedOffset: PARSED.capturedOffset,
			metadata: PARSED.metadata,
			createdBy: 'keeper-1',
			updatedBy: 'keeper-1'
		});
		expect(result).toEqual({
			id: row!.id,
			url: row!.url,
			originalUrl: row!.originalUrl,
			width: 2560,
			height: 1707,
			capturedAt: PARSED.capturedAt
		});
		// The metadata comes from the original's own bytes.
		expect(parseImageMetadata).toHaveBeenCalledWith(original);
		// A small original arrives whole with its first ranged read: one read, not two.
		expect(fetchObject.mock.calls.filter(([key]) => key === keys.originalKey)).toHaveLength(1);
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it("records a contributor's photograph unattributed, reading a large original in full", async () => {
		const owner = draftOwner();
		const original = jpeg(200 * 1024);
		const keys = uploaded(owner, { original });

		await finalizeImage(keys, owner);

		expect(await rowFor(keys.originalKey)).toMatchObject({
			setId: null,
			createdBy: null,
			originalBytes: 200 * 1024
		});
		expect(fetchObject.mock.calls.filter(([key]) => key === keys.originalKey)).toEqual([
			[keys.originalKey, { start: 0, end: 65535 }],
			[keys.originalKey]
		]);
		expect(parseImageMetadata).toHaveBeenCalledWith(original);
	});

	it('copes with a store that ignores the range and sends the whole original', async () => {
		store.ignoreRanges = true;
		const keys = uploaded(KEEPER, { original: jpeg(200 * 1024) });
		await finalizeImage(keys, KEEPER);
		expect((await rowFor(keys.originalKey))?.originalBytes).toBe(200 * 1024);
		expect(fetchObject.mock.calls.filter(([key]) => key === keys.originalKey)).toHaveLength(1);
	});

	it('keeps no name when the device gave none, and caps a long one', async () => {
		const blank = uploaded(KEEPER);
		await finalizeImage({ ...blank, name: '   ' }, KEEPER);
		expect((await rowFor(blank.originalKey))?.originalName).toBeNull();

		const long = uploaded(KEEPER);
		await finalizeImage({ ...long, name: '😀'.repeat(300) }, KEEPER);
		expect((await rowFor(long.originalKey))?.originalName).toBe('😀'.repeat(255));
	});

	it('strips control and bidi characters from a name, and mends a lone surrogate', async () => {
		const keys = uploaded(KEEPER);
		// U+202E (right-to-left override) and U+2066 (isolate) reorder how a name displays.
		await finalizeImage({ ...keys, name: 'IMG\u0000_00‮01⁦.JPG \ud800' }, KEEPER);
		expect((await rowFor(keys.originalKey))?.originalName).toBe('IMG_0001.JPG �');
	});

	it('records one row when the same keys are finalized concurrently', async () => {
		const owner = draftOwner();
		const keys = uploaded(owner);
		const [a, b] = await Promise.all([finalizeImage(keys, owner), finalizeImage(keys, owner)]);
		expect(a).toEqual(b);
		const rows = await db.select().from(image).where(eq(image.url, a.url));
		expect(rows).toHaveLength(1);
	});

	it('answers a repeated finalize with the row it already recorded', async () => {
		const owner = draftOwner();
		const keys = uploaded(owner);
		const first = await finalizeImage(keys, owner);
		fetchObject.mockClear();

		const again = await finalizeImage(keys, owner);

		expect(again).toEqual(first);
		expect(fetchObject).not.toHaveBeenCalled();
		const rows = await db.select().from(image).where(eq(image.url, first.url));
		expect(rows).toHaveLength(1);
	});

	it("refuses to hand another keeper's recorded row back, deleting nothing", async () => {
		const keys = uploaded(KEEPER);
		await finalizeImage(keys, KEEPER);

		const refused = await refusal(finalizeImage(keys, OTHER_KEEPER));
		expect(refused?.status).toBe(403);
		expect(deleteScan).not.toHaveBeenCalled();
		expect(store.objects.has(keys.originalKey)).toBe(true);
	});

	it('refuses malformed requests with 400', async () => {
		const keys = uploaded(KEEPER);
		const bodies: unknown[] = [
			null,
			'images/x/original.jpg',
			{},
			{ ...keys, originalKey: `../${keys.originalKey}` },
			{ ...keys, originalKey: keys.originalKey.replace('.jpg', '.svg') },
			{ ...keys, displayKey: keys.displayKey.replace('display', 'other') },
			{ ...keys, displayKey: imageKeys('', 'image/jpeg').displayKey },
			// The display copy beside its original, where its public URL would lead to it.
			{ ...keys, displayKey: keys.originalKey.replace(/original\.jpg$/, 'display.webp') },
			{ ...keys, name: 42 },
			{ originalKey: keys.originalKey, displayKey: keys.displayKey }
		];
		for (const body of bodies) {
			expect((await refusal(finalizeImage(body, KEEPER)))?.status, JSON.stringify(body)).toBe(400);
		}
		expect(fetchObject).not.toHaveBeenCalled();
	});

	it("refuses keys outside the caller's own space with 403, touching nothing", async () => {
		const owner = draftOwner();
		const cases: [UploadOwner, ReturnType<typeof uploaded>][] = [
			// another visitor's draft
			[owner, uploaded(draftOwner())],
			// a keeper's upload at the root
			[owner, uploaded(KEEPER)],
			// a keeper reaching into a contributor's submissions
			[KEEPER, uploaded(owner)]
		];
		for (const [caller, keys] of cases) {
			expect((await refusal(finalizeImage(keys, caller)))?.status).toBe(403);
		}
		expect(fetchObject).not.toHaveBeenCalled();
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it('answers 409 while either object is missing, and keeps what did land', async () => {
		const noOriginal = uploaded(KEEPER, { original: null });
		expect((await refusal(finalizeImage(noOriginal, KEEPER)))?.status).toBe(409);

		const noDisplay = uploaded(KEEPER, { display: null });
		const refused = await refusal(finalizeImage(noDisplay, KEEPER));
		expect(refused?.status).toBe(409);
		expect(refused?.message).toMatch(/not finished uploading/);

		expect(deleteScan).not.toHaveBeenCalled();
		expect(store.objects.has(noDisplay.originalKey)).toBe(true);
		expect(await rowFor(noDisplay.originalKey)).toBeUndefined();
	});

	it('refuses an original that is not the type its key names, deleting both objects', async () => {
		const keys = uploaded(KEEPER, { original: png() });
		const refused = await refusal(finalizeImage(keys, KEEPER));
		expect(refused?.status).toBe(415);
		expect(deletedKeys()).toEqual([keys.displayKey, keys.originalKey].sort());
		expect(store.objects.size).toBe(0);
		expect(await rowFor(keys.originalKey)).toBeUndefined();
	});

	it('refuses an original that is no image at all, deleting both objects', async () => {
		const keys = uploaded(KEEPER, { original: new TextEncoder().encode('<svg onload=alert(1)>') });
		expect((await refusal(finalizeImage(keys, KEEPER)))?.status).toBe(415);
		expect(deletedKeys()).toEqual([keys.displayKey, keys.originalKey].sort());
	});

	it('refuses an empty original with 413, deleting both objects', async () => {
		const keys = uploaded(KEEPER, { original: new Uint8Array(0) });
		expect((await refusal(finalizeImage(keys, KEEPER)))?.status).toBe(413);
		expect(deletedKeys()).toEqual([keys.displayKey, keys.originalKey].sort());
	});

	it('refuses an oversized original from its first read, never downloading it', async () => {
		const keys = uploaded(KEEPER);
		store.put(keys.originalKey, jpeg(), MAX_ORIGINAL_BYTES + 1);

		expect((await refusal(finalizeImage(keys, KEEPER)))?.status).toBe(413);
		expect(fetchObject.mock.calls.filter(([key]) => key === keys.originalKey)).toEqual([
			[keys.originalKey, { start: 0, end: 65535 }]
		]);
		expect(deletedKeys()).toEqual([keys.displayKey, keys.originalKey].sort());
	});

	it('refuses an oversized original sent whole by a store that ignores ranges', async () => {
		store.ignoreRanges = true;
		const keys = uploaded(KEEPER);
		store.put(keys.originalKey, jpeg(), MAX_ORIGINAL_BYTES + 1);
		expect((await refusal(finalizeImage(keys, KEEPER)))?.status).toBe(413);
		expect(deletedKeys()).toEqual([keys.displayKey, keys.originalKey].sort());
	});

	it('refuses a display copy that is not a WebP, deleting both objects', async () => {
		const keys = uploaded(KEEPER, { display: jpeg() });
		expect((await refusal(finalizeImage(keys, KEEPER)))?.status).toBe(415);
		expect(deletedKeys()).toEqual([keys.displayKey, keys.originalKey].sort());
	});

	it('refuses a display copy over its byte cap, deleting both objects', async () => {
		const keys = uploaded(KEEPER);
		store.put(keys.displayKey, webp(2560, 1707), MAX_DISPLAY_BYTES + 1);
		expect((await refusal(finalizeImage(keys, KEEPER)))?.status).toBe(413);
		expect(deletedKeys()).toEqual([keys.displayKey, keys.originalKey].sort());
	});

	it('refuses a display copy over 2560 pixels on either edge, deleting both objects', async () => {
		for (const [width, height] of [
			[2561, 1000],
			[1000, 2561]
		]) {
			deleteScan.mockClear();
			const keys = uploaded(KEEPER, { display: webp(width, height) });
			expect((await refusal(finalizeImage(keys, KEEPER)))?.status).toBe(422);
			expect(deletedKeys()).toEqual([keys.displayKey, keys.originalKey].sort());
		}
	});

	it('refuses a display copy carrying EXIF or XMP, deleting both objects', async () => {
		const cases = [
			webp(1200, 800, { extra: riffChunk('EXIF', ascii('II*\0')) }),
			webp(1200, 800, { extra: [...riffChunk('ALPH', [1, 2, 3]), ...riffChunk('XMP ', [0])] }),
			// Past the RIFF's declared end, where a reader of the public file may still look.
			webp(1200, 800, { trailing: riffChunk('EXIF', ascii('MM\0*')) })
		];
		for (const display of cases) {
			deleteScan.mockClear();
			const keys = uploaded(KEEPER, { display });
			const refused = await refusal(finalizeImage(keys, KEEPER));
			expect(refused?.status).toBe(422);
			expect(refused?.message).toMatch(/EXIF or XMP/);
			expect(deletedKeys()).toEqual([keys.displayKey, keys.originalKey].sort());
		}
	});

	it('accepts a display copy with other chunks, such as a color profile', async () => {
		const display = webp(1200, 800, { extra: riffChunk('ICCP', new Array(9).fill(7)) });
		const keys = uploaded(KEEPER, { display });
		expect((await finalizeImage(keys, KEEPER)).width).toBe(1200);
	});

	it('judges the original by its full bytes, not only its first read', async () => {
		// Same size, same leading type at the first read — then other bytes, as a
		// re-PUT to a still-valid upload URL could leave them.
		const keys = uploaded(KEEPER, { original: jpeg(200 * 1024) });
		fetchObject.mockImplementation(async (key, range) =>
			key === keys.originalKey && !range
				? new Response(new Blob([png(200 * 1024) as BlobPart]))
				: store.fetch(key, range)
		);

		const refused = await refusal(finalizeImage(keys, KEEPER));
		expect(refused?.status).toBe(415);
		expect(deletedKeys()).toEqual([keys.displayKey, keys.originalKey].sort());
		expect(parseImageMetadata).not.toHaveBeenCalled();
		expect(await rowFor(keys.originalKey)).toBeUndefined();
	});

	it('treats an unreadable Content-Range as a storage failure, deleting nothing', async () => {
		const keys = uploaded(KEEPER);
		fetchObject.mockResolvedValueOnce(
			new Response(new Blob([jpeg(16) as BlobPart]), {
				status: 206,
				headers: { 'content-range': 'bytes 0-15/*' }
			})
		);
		await expect(finalizeImage(keys, KEEPER)).rejects.toThrow(/Content-Range/);
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it('lets a storage failure through untouched, so a retry can still succeed', async () => {
		const keys = uploaded(KEEPER);
		fetchObject.mockRejectedValueOnce(new Error('R2 read failed: 503'));

		await expect(finalizeImage(keys, KEEPER)).rejects.toThrow('R2 read failed: 503');
		expect(deleteScan).not.toHaveBeenCalled();

		await finalizeImage(keys, KEEPER);
		expect(await rowFor(keys.originalKey)).toBeDefined();
	});

	it('still records the photograph, undated, should the metadata parser throw', async () => {
		parseImageMetadata.mockRejectedValueOnce(new Error('parser bug'));
		const keys = uploaded(KEEPER);
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await finalizeImage(keys, KEEPER);
			expect(logged).toHaveBeenCalled();
		} finally {
			logged.mockRestore();
		}
		expect(await rowFor(keys.originalKey)).toMatchObject({
			capturedAt: null,
			capturedOffset: null,
			metadata: null
		});
	});
});

// --- deleteUnattachedImage --------------------------------------------------

describe('deleteUnattachedImage', () => {
	it('deletes only when the row exists, is the caller’s, and is unattached', async () => {
		const owner = draftOwner();
		const mine = await finalizeImage(uploaded(owner), owner);
		const [set] = await db.insert(imageSet).values({}).returning();
		const attached = await finalizeImage(uploaded(owner), owner);
		await db.update(image).set({ setId: set.id }).where(eq(image.id, attached.id));
		deleteScan.mockClear();

		expect(await deleteUnattachedImage(999_999, owner)).toBe('not-found');
		expect(await deleteUnattachedImage(mine.id, draftOwner())).toBe('forbidden');
		expect(await deleteUnattachedImage(mine.id, KEEPER)).toBe('forbidden');
		// Not yours outranks attached: a stranger learns nothing about the set.
		expect(await deleteUnattachedImage(attached.id, draftOwner())).toBe('forbidden');
		expect(await deleteUnattachedImage(attached.id, owner)).toBe('attached');
		expect(deleteScan).not.toHaveBeenCalled();

		expect(await deleteUnattachedImage(mine.id, owner)).toBe('deleted');
		expect(await db.select().from(image).where(eq(image.id, mine.id)).get()).toBeUndefined();
		expect(deletedKeys()).toEqual(
			[mine.url, mine.originalUrl].map((url) => url.replace('https://bucket.test/', '')).sort()
		);
		expect(await deleteUnattachedImage(mine.id, owner)).toBe('not-found');
	});
});
