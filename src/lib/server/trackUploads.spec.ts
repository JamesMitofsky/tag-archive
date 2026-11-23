import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./db/testing');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());

/** The bucket, as the objects in it. Ranged reads answer 206 like R2 does. */
const objects = vi.hoisted(() => new Map<string, Uint8Array>());
const reads = vi.hoisted(() => [] as { key: string; start: number }[]);
const deleteScan = vi.hoisted(() => vi.fn(async (key: string) => void objects.delete(key)));
vi.mock('./scans', async (importOriginal) => ({
	...(await importOriginal<typeof import('./scans')>()),
	deleteScan,
	fetchObject: vi.fn(async (key: string, range?: { start: number; end: number }) => {
		const body = objects.get(key);
		if (!body) return null;
		const start = range?.start ?? 0;
		reads.push({ key, start });
		if (start >= body.length) return new Response(null, { status: 416 });
		const end = Math.min(range?.end ?? body.length - 1, body.length - 1);
		return new Response(body.slice(start, end + 1), {
			status: 206,
			headers: { 'content-range': `bytes ${start}-${end}/${body.length}` }
		});
	})
}));

const { migrateTestDatabase } = await import('./db/testing');
const { db } = await import('./db');
const { track, user } = await import('./db/schema');
const { trackKey, trackTicket } = await import('./trackKeys');
const { deleteUnattachedTrack, finalizeTrack, TrackUploadError } = await import('./trackUploads');

const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, ...Array(400).fill(0)]);
const FLAC = new Uint8Array([...'fLaC'].map((c) => c.charCodeAt(0)).concat(Array(40).fill(0)));
const ME = 'keeper-1';
const OTHER = 'keeper-2';

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ id: ME, name: 'Me', email: 'me@example.org', role: 'contributor' },
		{ id: OTHER, name: 'Other', email: 'other@example.org', role: 'contributor' }
	]);
});

beforeEach(() => {
	deleteScan.mockClear();
	reads.length = 0;
});

/** An object stored under a fresh key, and the finalize body that asks for it. */
function stored(bytes: Uint8Array, type: 'audio/mpeg' | 'audio/flac' = 'audio/mpeg', by = ME) {
	const key = trackKey(type);
	objects.set(key, bytes);
	return { key, ticket: trackTicket(by, key), name: '03 - Root.mp3', duration: 245.2 };
}

async function refusal(promise: Promise<unknown>): Promise<number | undefined> {
	try {
		await promise;
	} catch (e) {
		if (e instanceof TrackUploadError) return e.status;
		throw e;
	}
	return undefined;
}

describe('finalizeTrack', () => {
	it('records an unattached track titled after its file, sized by the bucket', async () => {
		const body = stored(MP3);
		const uploaded = await finalizeTrack(body, ME);
		expect(uploaded).toMatchObject({
			title: 'Root',
			type: 'audio/mpeg',
			bytes: MP3.length,
			duration: 245.2,
			originalName: '03 - Root.mp3',
			url: `https://bucket.test/${body.key}`
		});
		const [row] = await db.select().from(track).where(eq(track.id, uploaded.id));
		expect(row.albumId).toBeNull();
		expect(row.createdBy).toBe(ME);
		// Only the start of the file was read.
		expect(reads).toEqual([{ key: body.key, start: 0 }]);
	});

	it('answers a retry with the row it recorded', async () => {
		const body = stored(MP3);
		const first = await finalizeTrack(body, ME);
		expect((await finalizeTrack(body, ME)).id).toBe(first.id);
	});

	it('refuses a ticket issued to someone else, touching nothing', async () => {
		const body = stored(MP3, 'audio/mpeg', OTHER);
		expect(await refusal(finalizeTrack(body, ME))).toBe(403);
		expect(deleteScan).not.toHaveBeenCalled();
		expect(objects.has(body.key)).toBe(true);
	});

	it('refuses a key that is not the archive’s layout', async () => {
		const key = 'images/whatever.mp3';
		expect(await refusal(finalizeTrack({ key, ticket: trackTicket(ME, key), name: 'x' }, ME))).toBe(
			400
		);
	});

	it('answers 409 while the file has not landed, and keeps nothing', async () => {
		const key = trackKey('audio/mpeg');
		expect(
			await refusal(finalizeTrack({ key, ticket: trackTicket(ME, key), name: 'x.mp3' }, ME))
		).toBe(409);
	});

	it('refuses, and deletes, a file that is not the audio its key names', async () => {
		const flacAsMp3 = stored(FLAC, 'audio/mpeg');
		expect(await refusal(finalizeTrack(flacAsMp3, ME))).toBe(415);
		expect(objects.has(flacAsMp3.key)).toBe(false);

		const pdf = stored(new TextEncoder().encode('%PDF-1.7 not audio at all'));
		expect(await refusal(finalizeTrack(pdf, ME))).toBe(415);
		expect(objects.has(pdf.key)).toBe(false);
	});

	it('refuses, and deletes, an empty file', async () => {
		const empty = stored(new Uint8Array(0));
		expect(await refusal(finalizeTrack(empty, ME))).toBe(413);
		expect(objects.has(empty.key)).toBe(false);
	});

	it('drops an implausible duration rather than refusing the track', async () => {
		const body = { ...stored(MP3), duration: Number.POSITIVE_INFINITY };
		expect((await finalizeTrack(body, ME)).duration).toBeNull();
		const negative = { ...stored(MP3), duration: -3 };
		expect((await finalizeTrack(negative, ME)).duration).toBeNull();
	});
});

describe('deleteUnattachedTrack', () => {
	it('deletes an own unattached track and its file, and refuses anyone else', async () => {
		const body = stored(MP3);
		const { id } = await finalizeTrack(body, ME);
		expect(await deleteUnattachedTrack(id, OTHER)).toBe('forbidden');
		expect(await deleteUnattachedTrack(id, ME)).toBe('deleted');
		expect(objects.has(body.key)).toBe(false);
		expect(await deleteUnattachedTrack(id, ME)).toBe('not-found');
	});
});
