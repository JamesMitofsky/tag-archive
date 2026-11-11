import { beforeEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	// The proxy imports the upload module, which opens the database (lazily: no
	// query runs here, so no migration is needed).
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
	Object.assign(process.env, {
		BETTER_AUTH_SECRET: 'test-secret',
		R2_PUBLIC_URL: 'https://bucket.test',
		S3_ENDPOINT: 'http://s3.test'
	});
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
// The proxy is dev-only; pin `dev` rather than rely on how vitest resolves it.
vi.mock('$app/environment', () => ({ browser: false, building: false, dev: true, version: '' }));
const putObject = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('$lib/server/scans', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/scans')>()),
	putObject
}));
// Not under test here; keep the metadata parser out of the import graph.
vi.mock('$lib/server/imageMetadata', () => ({ parseImageMetadata: vi.fn() }));

const { uploadTarget } = await import('$lib/server/scans');
const { PUT } = await import('./+server');

const KEY =
	'submissions/AAAAAAAAAAAAAAAAAAAAAA/images/0b0e7d6c-3a1f-4c2b-9f5e-1d2c3b4a5f60/original.jpg';

beforeEach(() => {
	putObject.mockClear();
	process.env.S3_UPLOAD_PROXY = '1';
});

/** An upload URL as /api/images/upload-url issues it in proxy mode. */
async function target(size: number, { type = 'image/jpeg', now = Date.now() } = {}) {
	const { url } = await uploadTarget(KEY, type, size, 900, now);
	return new URL(url, 'http://localhost');
}

async function put(url: URL, body: BodyInit | null, headers: Record<string, string> = {}) {
	const event = {
		url,
		request: new Request(url, { method: 'PUT', body, headers, duplex: 'half' } as RequestInit)
	};
	try {
		// The handler reads only these fields of the RequestEvent.
		const response = await PUT(event as never);
		return { status: response.status, text: await response.text() };
	} catch (thrown) {
		const { status } = thrown as { status: number };
		if (typeof status !== 'number') throw thrown;
		return { status, text: '' };
	}
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

describe('PUT /api/images/put', () => {
	it('stores exactly the signed bytes under the signed key and type', async () => {
		const result = await put(await target(JPEG.length), JPEG, { 'content-type': 'image/jpeg' });
		expect(result).toEqual({ status: 200, text: '' });
		expect(putObject).toHaveBeenCalledWith(KEY, JPEG, 'image/jpeg');
	});

	it('does not exist unless the dev proxy is switched on', async () => {
		const url = await target(JPEG.length);
		process.env.S3_UPLOAD_PROXY = '0';
		expect((await put(url, JPEG, { 'content-type': 'image/jpeg' })).status).toBe(404);
		expect(putObject).not.toHaveBeenCalled();
	});

	it('refuses a tampered or expired link with 403', async () => {
		const tampered = await target(JPEG.length);
		tampered.searchParams.set('key', KEY.replace('original.jpg', 'evil.html'));
		const bigger = await target(JPEG.length);
		bigger.searchParams.set('size', String(JPEG.length + 1));
		const expired = await target(JPEG.length, { now: Date.now() - 901_000 });
		const unsigned = await target(JPEG.length);
		unsigned.searchParams.delete('sig');

		for (const url of [tampered, bigger, expired, unsigned]) {
			expect((await put(url, JPEG, { 'content-type': 'image/jpeg' })).status).toBe(403);
		}
		expect(putObject).not.toHaveBeenCalled();
	});

	it('refuses a Content-Type other than the signed one with 403', async () => {
		const url = await target(JPEG.length);
		for (const type of ['text/html', 'image/jpeg; charset=utf-8', 'IMAGE/JPEG']) {
			expect((await put(url, JPEG, { 'content-type': type })).status).toBe(403);
		}
		expect((await put(url, new Blob([JPEG]))).status).toBe(403);
		expect(putObject).not.toHaveBeenCalled();
	});

	it('refuses a body of any other size with 400', async () => {
		const url = await target(JPEG.length);
		const headers = { 'content-type': 'image/jpeg' };
		expect((await put(url, JPEG.slice(1), headers)).status).toBe(400);
		expect((await put(url, new Uint8Array([...JPEG, 0]), headers)).status).toBe(400);
		expect((await put(url, null, headers)).status).toBe(400);
		expect(putObject).not.toHaveBeenCalled();
	});

	it('refuses an oversized body as declared, before reading it', async () => {
		let pulled = 0;
		// No high-water mark, so nothing is pulled until someone reads.
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					pulled++;
					controller.enqueue(new Uint8Array(1024));
				}
			},
			{ highWaterMark: 0 }
		);
		const url = await target(JPEG.length);
		const result = await put(url, body, { 'content-type': 'image/jpeg', 'content-length': '4096' });
		expect(result.status).toBe(400);
		expect(pulled).toBe(0);
	});

	it('stops reading an undeclared body once it runs past the signed size', async () => {
		let pulled = 0;
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					pulled++;
					controller.enqueue(new Uint8Array(8));
				}
			},
			{ highWaterMark: 0 }
		);
		const result = await put(await target(JPEG.length), body, { 'content-type': 'image/jpeg' });
		expect(result.status).toBe(400);
		expect(pulled).toBeLessThan(5);
		expect(putObject).not.toHaveBeenCalled();
	});
});
