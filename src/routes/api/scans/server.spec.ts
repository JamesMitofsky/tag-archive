import type { Cookies } from '@sveltejs/kit';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
const deleteScan = vi.hoisted(() => vi.fn(async (_key: string) => {}));
vi.mock('$lib/server/scans', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/scans')>()),
	deleteScan
}));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { artefact, image, imageSet } = await import('$lib/server/db/schema');
const { DRAFT_COOKIE, mintDraftToken, submissionPrefix } = await import('$lib/server/drafts');
const { imageKeys } = await import('$lib/server/imageKeys');
const { DELETE, POST } = await import('./+server');
const { MAX_SCAN_BYTES, SCAN_TOO_LARGE } = await import('$lib/scanner/limits');

/** An open access pass, as hooks.server.ts leaves it on `locals` ($lib/access/pass). */
const OPEN_PASS = { kind: 't' as const, issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER };
const KEEPER = { user: { id: 'keeper-1' } };
const url = (key: string) => `https://bucket.test/${key}`;

type Caller = { user?: { id: string }; pass?: typeof OPEN_PASS; draftToken?: string };

const { token: draftToken, draft } = mintDraftToken();
const VISITOR: Caller = { pass: OPEN_PASS, draftToken };
const PREFIX = submissionPrefix(draft.id);

/** A photograph's two objects, recorded by an image row (in a set or not). */
async function photograph(prefix: string, setId: number | null) {
	const keys = imageKeys(prefix, 'image/jpeg');
	await db.insert(image).values({
		setId,
		url: url(keys.displayKey),
		originalUrl: url(keys.originalKey),
		originalType: 'image/jpeg',
		originalBytes: 1000,
		bytes: 500,
		width: 40,
		height: 30
	});
	return keys;
}

async function remove(caller: Caller, target: string) {
	const event = {
		request: new Request('http://localhost/api/scans', {
			method: 'DELETE',
			body: JSON.stringify({ url: target })
		}),
		locals: { user: caller.user, pass: caller.pass },
		cookies: {
			get: (name: string) => (name === DRAFT_COOKIE ? caller.draftToken : undefined)
		} as Cookies
	};
	try {
		// The handler reads only these fields of the RequestEvent.
		const response = await DELETE(event as never);
		return { status: response.status };
	} catch (thrown) {
		return { status: (thrown as { status?: number }).status };
	}
}

let setId: number;
beforeAll(async () => {
	await migrateTestDatabase();
	[{ id: setId }] = await db.insert(imageSet).values({}).returning({ id: imageSet.id });
	await db.insert(artefact).values({
		artefact: 'Flyer',
		date: '2024',
		fileUrls: [url('saved.webp'), url(`${PREFIX}submitted.webp`)]
	});
});
beforeEach(() => deleteScan.mockClear());

describe('DELETE /api/scans', () => {
	it('deletes a scan nothing uses', async () => {
		expect(await remove(KEEPER, url('draft.webp'))).toEqual({ status: 200 });
		expect(await remove(VISITOR, url(`${PREFIX}draft.webp`))).toEqual({ status: 200 });
		expect(deleteScan.mock.calls).toEqual([['draft.webp'], [`${PREFIX}draft.webp`]]);
	});

	it("refuses a saved artefact's scan", async () => {
		expect(await remove(KEEPER, url('saved.webp'))).toEqual({ status: 403 });
		expect(await remove(VISITOR, url(`${PREFIX}submitted.webp`))).toEqual({ status: 403 });
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it("refuses either object of a photograph, attached or not, even its uploader's", async () => {
		const keeper = [await photograph('', setId), await photograph('', null)];
		const visitor = [await photograph(PREFIX, setId), await photograph(PREFIX, null)];
		for (const keys of keeper) {
			expect(await remove(KEEPER, url(keys.originalKey))).toEqual({ status: 403 });
			expect(await remove(KEEPER, url(keys.displayKey))).toEqual({ status: 403 });
		}
		for (const keys of visitor) {
			expect(await remove(VISITOR, url(keys.originalKey))).toEqual({ status: 403 });
			expect(await remove(VISITOR, url(keys.displayKey))).toEqual({ status: 403 });
		}
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it("refuses a visitor another draft's upload", async () => {
		const other = submissionPrefix(mintDraftToken().draft.id);
		expect(await remove(VISITOR, url(`${other}draft.webp`))).toEqual({ status: 403 });
		expect(deleteScan).not.toHaveBeenCalled();
	});

	it('refuses a URL that climbs out of its folder, encoded or not', async () => {
		// A vetted photograph: its display URL is public, so anyone can aim at it.
		const target = await photograph('', setId);
		// Each starts with the visitor's own prefix, and none is stored anywhere,
		// but the URL parser that builds the bucket request turns every one of
		// them into the target's own key.
		const climbs = ['%2e%2e/%2e%2e/', '.%2E/%2E./', '..\\..\\', '.\t./.\n./'];
		for (const climb of climbs) {
			const key = `${PREFIX}${climb}${target.displayKey}`;
			expect(new URL(`http://s3.test/tag-archive/${key}`).pathname).toBe(
				`/tag-archive/${target.displayKey}`
			);
			expect(await remove(VISITOR, url(key))).toEqual({ status: 400 });
		}
		// A keeper needs no prefix; the saved artefact's scan is as exposed.
		expect(await remove(KEEPER, url(`x/%2e%2e/${target.originalKey}`))).toEqual({ status: 400 });
		expect(await remove(KEEPER, url('x/%2e%2e/saved.webp'))).toEqual({ status: 400 });
		expect(deleteScan).not.toHaveBeenCalled();
	});
});

describe('POST /api/scans size limit', () => {
	/** A keeper's upload of `bytes` zero bytes, so no rate limit or draft is involved. */
	async function upload(bytes: number, declared?: number) {
		const body = new FormData();
		body.append('file', new File([new Uint8Array(bytes)], 'scan.webp', { type: 'image/webp' }));
		const request = new Request('http://localhost/api/scans', { method: 'POST', body });
		if (declared !== undefined) {
			// Stand in for what the client says before its body is read.
			Object.defineProperty(request, 'headers', {
				value: new Headers({ 'content-length': String(declared) })
			});
		}
		const event = {
			request,
			locals: KEEPER,
			cookies: { get: () => undefined } as unknown as Cookies
		};
		try {
			const response = await POST(event as never);
			return { status: response.status };
		} catch (thrown) {
			const { status, body } = thrown as { status?: number; body?: { message?: string } };
			return { status, message: body?.message };
		}
	}

	it('refuses a scan over the cap, saying why, before storing anything', async () => {
		expect(await upload(MAX_SCAN_BYTES + 1)).toEqual({ status: 413, message: SCAN_TOO_LARGE });
	});

	it('refuses a body declared past the cap without reading it', async () => {
		expect(await upload(10, MAX_SCAN_BYTES + 128 * 1024)).toEqual({
			status: 413,
			message: SCAN_TOO_LARGE
		});
	});

	it('lets a scan of exactly the cap past the size check', async () => {
		// Zero bytes are no image, so it is refused next, by type: the size passed.
		expect((await upload(MAX_SCAN_BYTES)).status).toBe(415);
	});

	it('stays under the platform body limit, multipart framing included', () => {
		expect(MAX_SCAN_BYTES + 64 * 1024).toBeLessThan(4.5 * 1024 * 1024);
	});
});
