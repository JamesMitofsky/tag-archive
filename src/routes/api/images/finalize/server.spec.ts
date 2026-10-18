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

// Stored objects, served whole: finalizeImage's read paths are covered in
// $lib/server/imageUploads.spec.ts; this spec is about the endpoint around it.
const objects = vi.hoisted(() => new Map<string, Uint8Array>());
const fetchObject = vi.hoisted(() =>
	vi.fn(async (key: string) => {
		const bytes = objects.get(key);
		return bytes ? new Response(new Blob([bytes as BlobPart])) : null;
	})
);
const deleteScan = vi.hoisted(() =>
	vi.fn(async (key: string) => {
		objects.delete(key);
	})
);
vi.mock('$lib/server/scans', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/scans')>()),
	fetchObject,
	deleteScan
}));
vi.mock('$lib/server/imageMetadata', () => ({
	parseImageMetadata: vi.fn(async () => ({
		capturedAt: '2024-06-01T14:03:09',
		capturedOffset: null,
		metadata: null
	}))
}));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { image, user } = await import('$lib/server/db/schema');
const { DRAFT_COOKIE, mintDraftToken, submissionPrefix } = await import('$lib/server/drafts');
const { imageKeys } = await import('$lib/server/imageKeys');
const { POST } = await import('./+server');

const KEEPER = { id: 'keeper-1' };

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values({ id: KEEPER.id, name: 'Keeper One', email: 'one@example.org' });
});
beforeEach(() => {
	objects.clear();
	fetchObject.mockClear();
	deleteScan.mockClear();
});

/** An open access pass, as hooks.server.ts leaves it on `locals` ($lib/access/pass). */
const OPEN_PASS = { kind: 't' as const, issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER };

type Caller = { user?: { id: string }; pass?: typeof OPEN_PASS; draftToken?: string };

function visitor(): Caller & { prefix: string } {
	const { token, draft } = mintDraftToken();
	return { pass: OPEN_PASS, draftToken: token, prefix: submissionPrefix(draft.id) };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(0)]);
// A VP8X WebP header for a 1200×800 canvas.
const WEBP = new Uint8Array([
	...[0x52, 0x49, 0x46, 0x46, 22, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
	...[0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0],
	...[0xaf, 0x04, 0x00, 0x1f, 0x03, 0x00]
]);

/** Keys for `prefix`, both objects stored as given. */
function upload(prefix: string, original: Uint8Array = JPEG, display: Uint8Array = WEBP) {
	const keys = imageKeys(prefix, 'image/jpeg');
	objects.set(keys.originalKey, original);
	objects.set(keys.displayKey, display);
	return { ...keys, name: 'IMG_0001.JPG' };
}

async function finalize(caller: Caller, body: unknown) {
	const event = {
		request: new Request('http://localhost/api/images/finalize', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		}),
		locals: { user: caller.user, pass: caller.pass },
		cookies: {
			get: (name: string) => (name === DRAFT_COOKIE ? caller.draftToken : undefined)
		} as Cookies
	};
	try {
		// The handler reads only these fields of the RequestEvent.
		const response = await POST(event as never);
		return { status: response.status, body: await response.json() };
	} catch (thrown) {
		const { status, body } = thrown as { status: number; body: { message: string } };
		if (typeof status !== 'number') throw thrown;
		return { status, body };
	}
}

describe('POST /api/images/finalize', () => {
	it('answers with the recorded image', async () => {
		const caller = visitor();
		const keys = upload(caller.prefix);
		const { status, body } = await finalize(caller, keys);
		expect(status).toBe(200);
		expect(body).toEqual({
			id: expect.any(Number),
			url: `https://bucket.test/${keys.displayKey}`,
			originalUrl: `https://bucket.test/${keys.originalKey}`,
			width: 1200,
			height: 800,
			capturedAt: '2024-06-01T14:03:09'
		});
		// Idempotent: the same keys again are the same image.
		expect((await finalize(caller, keys)).body).toEqual(body);
	});

	it("records a keeper's upload at the root as theirs, and refuses them a visitor's", async () => {
		const keys = upload('');
		const { status, body } = await finalize({ user: KEEPER }, keys);
		expect(status).toBe(200);
		const row = await db.select().from(image).where(eq(image.id, body.id)).get();
		expect(row?.createdBy).toBe(KEEPER.id);

		expect((await finalize({ user: KEEPER }, upload(visitor().prefix))).status).toBe(403);
	});

	it('answers a refusal with its status and message', async () => {
		const caller = visitor();
		const keys = upload(caller.prefix, JPEG, JPEG);
		const { status, body } = await finalize(caller, keys);
		expect(status).toBe(415);
		expect(body.message).toBe('The display copy is not a WebP image');
		expect(deleteScan).toHaveBeenCalledTimes(2);
	});

	it('refuses an unreadable body with 400, and keys outside the draft with 403', async () => {
		const caller = visitor();
		expect((await finalize(caller, 'not json')).status).toBe(400);
		expect((await finalize(caller, upload(visitor().prefix))).status).toBe(403);
		expect((await finalize(caller, upload(''))).status).toBe(403);
		expect(fetchObject).not.toHaveBeenCalled();
	});

	it('answers 409 while the upload is still landing', async () => {
		const caller = visitor();
		const keys = upload(caller.prefix);
		objects.delete(keys.displayKey);
		expect((await finalize(caller, keys)).status).toBe(409);
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it('lets a storage failure through as a server error', async () => {
		const caller = visitor();
		fetchObject.mockRejectedValueOnce(new Error('R2 read failed: 500'));
		await expect(finalize(caller, upload(caller.prefix))).rejects.toThrow('R2 read failed');
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it('answers locked without a pass, or with a pass but no draft', async () => {
		const caller = visitor();
		const keys = upload(caller.prefix);
		for (const locked of [{ draftToken: caller.draftToken }, { pass: OPEN_PASS }]) {
			const { status, body } = await finalize(locked, keys);
			expect(status).toBe(401);
			expect(body).toEqual({ message: 'Visit the Cube to open the Archive.', code: 'locked' });
		}
		expect(fetchObject).not.toHaveBeenCalled();
	});
});
