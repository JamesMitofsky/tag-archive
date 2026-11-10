import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		R2_PUBLIC_URL: 'https://bucket.test',
		R2_ACCESS_KEY_ID: 'id',
		R2_SECRET_ACCESS_KEY: 'secret',
		R2_BUCKET: 'tag-archive',
		S3_ENDPOINT: 'http://s3.test'
	}
}));

// Two pages of ListObjectsV2, the first truncated, as R2/S3 return them.
const pages = [
	`<ListBucketResult><IsTruncated>true</IsTruncated>
		<Contents><Key>submissions/a/1.webp</Key><LastModified>2026-10-01T00:00:00.000Z</LastModified></Contents>
		<Contents><Key>submissions/a/R&amp;D.webp</Key><LastModified>2026-10-01T01:00:00.000Z</LastModified></Contents>
		<NextContinuationToken>tok&amp;en</NextContinuationToken></ListBucketResult>`,
	`<ListBucketResult><IsTruncated>false</IsTruncated>
		<Contents><Key>submissions/b/2.webp</Key><LastModified>2026-10-02T00:00:00.000Z</LastModified></Contents>
		</ListBucketResult>`
];
const requested: string[] = [];
vi.mock('aws4fetch', () => ({
	AwsClient: class {
		async fetch(url: string) {
			requested.push(url);
			return new Response(pages[requested.length - 1]);
		}
	}
}));

const { deleteScan, fetchObject, isPlainKey, keyFromUrl, listScans, presignPut, putObject } =
	await import('./scans');

const UUID = '0b6f8d2e-3c4a-4f1e-9a7b-5d2c1e0f9a8b';
// Draft ids are base64url, so may start with '-' or '_'.
const DRAFT = '-bCdEfGhIjKlMnOpQrSt_v';

/** Every key shape the archive has issued. */
const ISSUED = [
	'legacy.jpg',
	`${UUID}.webp`,
	`submissions/${DRAFT}/${UUID}.heic`,
	'seed/12.svg',
	`images/${UUID}/original.jpg`,
	`images/${UUID}/display.webp`,
	`submissions/${DRAFT}/images/${UUID}/original.heic`,
	`submissions/${DRAFT}/images/${UUID}/display.webp`
];

/**
 * Keys that aren't plain. Most of them the URL parser that builds a bucket
 * request rewrites into a different key: dot segments, encoded or split by
 * whitespace it strips, and backslashes, all step up a folder.
 */
const NOT_PLAIN = [
	'',
	'/x.webp',
	'x.webp/',
	'a//b.webp',
	'.',
	'..',
	'submissions/../x.webp',
	'submissions/./x.webp',
	`submissions/${DRAFT}/%2e%2e/%2e%2e/images/${UUID}/display.webp`,
	`submissions/${DRAFT}/.%2E/x.webp`,
	`submissions/${DRAFT}/%2E./x.webp`,
	`submissions/${DRAFT}/..\\..\\x.webp`,
	'submissions\\x.webp',
	`submissions/${DRAFT}/.\t./x.webp`,
	`submissions/${DRAFT}/.\n./x.webp`,
	'x%20y.webp',
	'x y.webp',
	'x.webp?x-id=DeleteObjects',
	'x.webp#display',
	'.hidden.webp',
	'images/.well-known/x.webp',
	'café.webp',
	'\uff41.webp'
];

describe('listScans', () => {
	it('follows continuation tokens and unescapes keys', async () => {
		const objects = await listScans('submissions/');
		expect(objects.map((o) => o.key)).toEqual([
			'submissions/a/1.webp',
			'submissions/a/R&D.webp',
			'submissions/b/2.webp'
		]);
		expect(objects[2].lastModified.toISOString()).toBe('2026-10-02T00:00:00.000Z');
		expect(new URL(requested[1]).searchParams.get('continuation-token')).toBe('tok&en');
	});
});

describe('isPlainKey', () => {
	it.each(ISSUED)('accepts %j', (key) => {
		expect(isPlainKey(key)).toBe(true);
		// What it accepts, the URL parser leaves alone.
		expect(new URL(`http://s3.test/tag-archive/${key}`).pathname).toBe(`/tag-archive/${key}`);
	});

	it.each(NOT_PLAIN)('refuses %j', (key) => {
		expect(isPlainKey(key)).toBe(false);
	});
});

describe('keyFromUrl', () => {
	it('keeps the full key, slashes included', () => {
		expect(keyFromUrl('https://bucket.test/submissions/a/1.webp')).toBe('submissions/a/1.webp');
		for (const key of ISSUED) expect(keyFromUrl(`https://bucket.test/${key}`)).toBe(key);
	});

	it('refuses URLs we did not serve', () => {
		expect(keyFromUrl('/artefacts/TAG-001.jpg')).toBeNull();
		expect(keyFromUrl('https://bucket.test.evil/x.webp')).toBeNull();
	});

	it.each(NOT_PLAIN)('refuses a URL whose key is %j', (key) => {
		expect(keyFromUrl(`https://bucket.test/${key}`)).toBeNull();
	});
});

describe('the bucket requests', () => {
	it.each(NOT_PLAIN)('refuse %j before sending anything', async (key) => {
		const sent = requested.length;
		await expect(deleteScan(key)).rejects.toThrow('Not a plain bucket key');
		await expect(putObject(key, new Uint8Array(1), 'image/webp')).rejects.toThrow(
			'Not a plain bucket key'
		);
		await expect(fetchObject(key)).rejects.toThrow('Not a plain bucket key');
		await expect(presignPut(key, 'image/webp', 1)).rejects.toThrow('Not a plain bucket key');
		expect(requested.length).toBe(sent);
	});

	it('send a plain key as it is', async () => {
		await deleteScan(`images/${UUID}/display.webp`);
		expect(requested.at(-1)).toBe(`http://s3.test/tag-archive/images/${UUID}/display.webp`);
	});
});
