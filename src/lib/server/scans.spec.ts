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

const { keyFromUrl, listScans } = await import('./scans');

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

describe('keyFromUrl', () => {
	it('keeps the full key, slashes included', () => {
		expect(keyFromUrl('https://bucket.test/submissions/a/1.webp')).toBe('submissions/a/1.webp');
		expect(keyFromUrl('https://bucket.test/legacy.jpg')).toBe('legacy.jpg');
	});

	it('refuses URLs we did not serve, and path tricks', () => {
		expect(keyFromUrl('/artefacts/TAG-001.jpg')).toBeNull();
		expect(keyFromUrl('https://bucket.test.evil/x.webp')).toBeNull();
		expect(keyFromUrl('https://bucket.test/submissions/../x.webp')).toBeNull();
		expect(keyFromUrl('https://bucket.test/a//b.webp')).toBeNull();
	});
});
