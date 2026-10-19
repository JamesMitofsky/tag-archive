import type { Cookies } from '@sveltejs/kit';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
	Object.assign(process.env, {
		BETTER_AUTH_SECRET: 'test-secret',
		R2_PUBLIC_URL: 'https://bucket.test',
		// Presigning is local crypto: these let the real `uploadTarget` run offline.
		R2_ACCESS_KEY_ID: 'id',
		R2_SECRET_ACCESS_KEY: 'secret',
		R2_BUCKET: 'tag-archive',
		S3_ENDPOINT: 'http://s3.test'
	});
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
// The upload proxy is dev-only; pin `dev` rather than rely on how vitest resolves it.
vi.mock('$app/environment', () => ({ browser: false, building: false, dev: true, version: '' }));
// The real limiter, watched, so a spec can see which allowances a request draws on.
vi.mock('$lib/server/rateLimit', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/rateLimit')>();
	return { ...actual, consume: vi.fn(actual.consume) };
});
// finalize is not under test here; keep the metadata parser out of the import graph.
vi.mock('$lib/server/imageMetadata', () => ({ parseImageMetadata: vi.fn() }));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { image } = await import('$lib/server/db/schema');
const { DRAFT_COOKIE, mintDraftToken, submissionPrefix } = await import('$lib/server/drafts');
const { consume, LIMITS } = await import('$lib/server/rateLimit');
const { MAX_DISPLAY_BYTES, MAX_ORIGINAL_BYTES, UPLOAD_URL_TTL_S } =
	await import('$lib/server/imageUploads');
const { sign, verify } = await import('$lib/server/signing');
const { verifyProxyPut } = await import('$lib/server/scans');
const { parseOriginalKey } = await import('$lib/server/imageKeys');
const { POST } = await import('./+server');

type Grant = import('$lib/images/types').OriginalUploadGrant;
type DisplayGrant = import('$lib/images/types').DisplayUploadGrant;

beforeAll(migrateTestDatabase);
beforeEach(() => {
	vi.mocked(consume).mockClear();
	delete process.env.S3_UPLOAD_PROXY;
});

/** An open access pass, as hooks.server.ts leaves it on `locals` ($lib/access/pass). */
const OPEN_PASS = { kind: 't' as const, issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER };
const KEEPER = { id: 'keeper-1' };
const IP = '198.51.100.7';

type Caller = { user?: { id: string }; pass?: typeof OPEN_PASS; draftToken?: string };

/** A fresh anonymous visitor: open pass, signed draft cookie. */
function visitor(): Caller & { draftId: string } {
	const { token, draft } = mintDraftToken();
	return { pass: OPEN_PASS, draftToken: token, draftId: draft.id };
}

async function call(caller: Caller, body: unknown) {
	const cookies = {
		get: (name: string) => (name === DRAFT_COOKIE ? caller.draftToken : undefined)
	} as Cookies;
	const event = {
		request: new Request('http://localhost/api/images/upload-url', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		}),
		locals: { user: caller.user, pass: caller.pass },
		cookies,
		getClientAddress: () => IP
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

const original = (overrides: Record<string, unknown> = {}) => ({
	object: 'original',
	type: 'image/jpeg',
	size: 3_000_000,
	name: 'IMG_0001.JPG',
	...overrides
});

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

describe('POST /api/images/upload-url — the gate', () => {
	it('answers locked without a pass, or with a pass but no draft', async () => {
		const { draftToken } = visitor();
		for (const caller of [{ draftToken }, { pass: OPEN_PASS }, {}]) {
			const { status, body } = await call(caller, original());
			expect(status).toBe(401);
			expect(body).toEqual({ message: 'Visit the Cube to open the Archive.', code: 'locked' });
		}
		expect(consume).not.toHaveBeenCalled();
	});
});

describe('POST /api/images/upload-url — originals', () => {
	it('issues a keeper keys at the bucket root and a presigned PUT, uncharged', async () => {
		const { status, body } = await call({ user: KEEPER }, original());
		expect(status).toBe(200);
		const grant = body as Grant;
		expect(grant.originalKey).toMatch(new RegExp(`^images/${UUID}/original\\.jpg$`));
		// In a folder of its own: the display URL is published, the original's isn't.
		expect(grant.displayKey).toMatch(new RegExp(`^images/${UUID}/display\\.webp$`));
		expect(grant.displayKey.split('/')[1]).not.toBe(grant.originalKey.split('/')[1]);
		expect(grant.displayKey).toBe(parseOriginalKey(grant.originalKey)?.displayKey);
		expect(verify('image-display', grant.originalKey, grant.ticket)).toBe(true);

		const url = new URL(grant.upload.url);
		expect(`${url.origin}${url.pathname}`).toBe(`http://s3.test/tag-archive/${grant.originalKey}`);
		expect(url.searchParams.get('X-Amz-Expires')).toBe(String(UPLOAD_URL_TTL_S));
		// Type and size are signed in, so the bucket refuses any other.
		expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
		expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
		expect(grant.upload.headers).toEqual({ 'Content-Type': 'image/jpeg' });
		expect(consume).not.toHaveBeenCalled();
	});

	it("issues a visitor keys in their draft's space, charged like a scan upload", async () => {
		const caller = visitor();
		const { status, body } = await call(caller, original({ type: 'image/heic' }));
		expect(status).toBe(200);
		expect((body as Grant).originalKey).toMatch(
			new RegExp(`^submissions/${caller.draftId}/images/${UUID}/original\\.heic$`)
		);
		expect((body as Grant).displayKey).toMatch(
			new RegExp(`^submissions/${caller.draftId}/images/${UUID}/display\\.webp$`)
		);
		expect(vi.mocked(consume).mock.calls).toEqual([
			['upload-ip', IP, LIMITS.uploadPerIp],
			['upload-draft', caller.draftId, LIMITS.uploadPerDraft]
		]);
	});

	it("answers 429 once the visitor's upload allowance — shared with scans — is spent", async () => {
		const caller = visitor();
		// Spend it the way /api/scans would.
		for (let i = 0; i < LIMITS.uploadPerDraft.limit; i++) {
			await consume('upload-draft', caller.draftId, LIMITS.uploadPerDraft);
		}
		expect((await call(caller, original())).status).toBe(429);
	});

	it('answers 429 when the per-IP backstop says so, leaving the draft allowance alone', async () => {
		vi.mocked(consume).mockResolvedValueOnce(false);
		expect((await call(visitor(), original())).status).toBe(429);
		expect(vi.mocked(consume).mock.calls.map(([bucket]) => bucket)).toEqual(['upload-ip']);
	});

	it('refuses a type it would not store with 415', async () => {
		for (const type of ['image/svg+xml', 'text/html', 'image/JPEG', 42, undefined]) {
			expect((await call({ user: KEEPER }, original({ type }))).status).toBe(415);
		}
	});

	it('refuses an empty or oversized original with 413', async () => {
		for (const size of [0, -1, MAX_ORIGINAL_BYTES + 1]) {
			expect((await call({ user: KEEPER }, original({ size }))).status).toBe(413);
		}
		expect((await call({ user: KEEPER }, original({ size: MAX_ORIGINAL_BYTES }))).status).toBe(200);
	});

	it('refuses malformed requests with 400, and charges nothing for them', async () => {
		const caller = visitor();
		for (const body of [
			'not json',
			null,
			[],
			{},
			original({ object: 'thumbnail' }),
			original({ size: '3000000' }),
			original({ size: 1.5 }),
			original({ size: 2 ** 53 }),
			original({ name: undefined })
		]) {
			expect((await call(caller, body)).status, JSON.stringify(body)).toBe(400);
		}
		expect(consume).not.toHaveBeenCalled();
	});
});

describe('POST /api/images/upload-url — display copies', () => {
	async function issued(caller: Caller) {
		return (await call(caller, original())).body as Grant;
	}
	const display = (grant: Grant, overrides: Record<string, unknown> = {}) => ({
		object: 'display',
		originalKey: grant.originalKey,
		ticket: grant.ticket,
		size: 180_000,
		...overrides
	});

	it('issues a WebP PUT for the display key, uncharged, on the original’s ticket', async () => {
		const caller = visitor();
		const grant = await issued(caller);
		vi.mocked(consume).mockClear();

		const { status, body } = await call(caller, display(grant));
		expect(status).toBe(200);
		const { upload } = body as DisplayGrant;
		const url = new URL(upload.url);
		expect(url.pathname).toBe(`/tag-archive/${grant.displayKey}`);
		expect(upload.headers).toEqual({ 'Content-Type': 'image/webp' });
		expect(consume).not.toHaveBeenCalled();
	});

	it('refuses a missing or wrong ticket with 403', async () => {
		const caller = visitor();
		const grant = await issued(caller);
		const other = await issued(caller);
		for (const ticket of [undefined, 42, '', other.ticket, sign('draft', grant.originalKey)]) {
			expect((await call(caller, display(grant, { ticket }))).status).toBe(403);
		}
	});

	it("refuses another uploader's original with 403, even with its ticket", async () => {
		const someone = visitor();
		const theirs = await issued(someone);
		expect((await call(visitor(), display(theirs))).status).toBe(403);
		expect((await call({ user: KEEPER }, display(theirs))).status).toBe(403);
		const keepers = await issued({ user: KEEPER });
		expect((await call(someone, display(keepers))).status).toBe(403);
	});

	it('refuses a key outside the layout with 400', async () => {
		const caller = visitor();
		const grant = await issued(caller);
		for (const originalKey of [
			grant.displayKey,
			`${grant.originalKey}/..`,
			grant.originalKey.replace('.jpg', '.svg'),
			42
		]) {
			expect((await call(caller, display(grant, { originalKey }))).status).toBe(400);
		}
	});

	it('refuses an empty or oversized display copy with 413', async () => {
		const caller = visitor();
		const grant = await issued(caller);
		for (const size of [0, MAX_DISPLAY_BYTES + 1]) {
			expect((await call(caller, display(grant, { size }))).status).toBe(413);
		}
		expect((await call(caller, display(grant, { size: 'big' }))).status).toBe(400);
	});

	it('issues no new display URL once the photograph is finalized', async () => {
		const caller = { user: KEEPER };
		const grant = await issued(caller);
		await db.insert(image).values({
			url: `https://bucket.test/${grant.displayKey}`,
			originalUrl: `https://bucket.test/${grant.originalKey}`,
			originalType: 'image/jpeg',
			originalBytes: 3_000_000,
			bytes: 180_000,
			width: 2560,
			height: 1707
		});
		expect((await call(caller, display(grant))).status).toBe(409);
	});
});

describe('POST /api/images/upload-url — the dev upload proxy', () => {
	it('hands out /api/images/put URLs carrying the same terms, signed', async () => {
		process.env.S3_UPLOAD_PROXY = '1';
		const caller = visitor();
		const { body } = await call(caller, original({ size: 1234 }));
		const grant = body as Grant;
		expect(grant.originalKey.startsWith(submissionPrefix(caller.draftId))).toBe(true);

		const url = new URL(grant.upload.url, 'http://localhost');
		expect(url.pathname).toBe('/api/images/put');
		expect(verifyProxyPut(url.searchParams)).toEqual({
			key: grant.originalKey,
			contentType: 'image/jpeg',
			size: 1234
		});

		const { body: displayBody } = await call(caller, {
			object: 'display',
			originalKey: grant.originalKey,
			ticket: grant.ticket,
			size: 99
		});
		const displayUrl = new URL((displayBody as DisplayGrant).upload.url, 'http://localhost');
		expect(verifyProxyPut(displayUrl.searchParams)).toEqual({
			key: grant.displayKey,
			contentType: 'image/webp',
			size: 99
		});
	});
});
