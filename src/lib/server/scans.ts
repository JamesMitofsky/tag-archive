import { AwsClient } from 'aws4fetch';
import { env } from '$env/dynamic/private';
import type { ImageType } from './imageType';

// S3-compatible storage for uploaded scan images. Objects are served straight from
// the bucket's public URL, so this module only handles writes. Credentials stay
// server-side via $env/dynamic/private — they never reach the client.
//
// Prod points at Cloudflare R2 (endpoint derived from the account id). Local dev
// points S3_ENDPOINT at a RustFS container instead, so uploads never touch the prod
// bucket — same code path, different endpoint + credentials.

function required(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`Missing ${name} — set it to enable scan uploads`);
	return value;
}

function client(): AwsClient {
	return new AwsClient({
		accessKeyId: required('R2_ACCESS_KEY_ID'),
		secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
		region: env.S3_REGION || 'auto',
		service: 's3'
	});
}

// Explicit S3_ENDPOINT (local RustFS) wins; otherwise derive the R2 host from the account id.
function s3Endpoint(): string {
	return env.S3_ENDPOINT || `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`;
}

function bucketEndpoint(): string {
	return `${s3Endpoint()}/${required('R2_BUCKET')}`;
}

// True only when pointed at a local RustFS (S3_ENDPOINT set by the dev run scripts).
// Prod derives its host from R2_ACCOUNT_ID and leaves S3_ENDPOINT unset — so the
// self-heal below can never fire against the real R2 bucket.
function isLocalStore(): boolean {
	return !!env.S3_ENDPOINT;
}

// Local dev is intentionally ephemeral: each `pnpm dev` starts a fresh RustFS with no
// bucket. `init-bucket.mjs` provisions it at boot, but a container-only restart wipes
// it again. Rather than persist data, recreate the bucket on demand — mirrors
// init-bucket.mjs (bucket PUT + public-read policy). Dev-only; never runs in prod.
async function ensureLocalBucket(c: AwsClient): Promise<void> {
	const url = bucketEndpoint();

	const created = await c.fetch(url, { method: 'PUT' });
	// 409 = already exists (raced with another upload) — treat as success.
	if (!created.ok && created.status !== 409) {
		throw new Error(`Local bucket create failed: ${created.status} ${await created.text()}`);
	}

	// Grant anonymous read so `${R2_PUBLIC_URL}/<key>` is fetchable in the browser.
	const policy = JSON.stringify({
		Version: '2012-10-17',
		Statement: [
			{
				Effect: 'Allow',
				Principal: { AWS: ['*'] },
				Action: ['s3:GetObject'],
				Resource: [`arn:aws:s3:::${required('R2_BUCKET')}/*`]
			}
		]
	});
	// Non-fatal: uploads still work without it; only public GETs might 403.
	await c.fetch(`${url}?policy`, {
		method: 'PUT',
		body: policy,
		headers: { 'Content-Type': 'application/json' }
	});
}

// File extension for each sniffed image type (see $lib/server/imageType).
const EXT_BY_TYPE: Record<ImageType, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/heic': 'heic'
};

/**
 * Upload bytes to R2 under a fresh random key, inside `prefix` (e.g. a draft's
 * `submissions/<id>/`); return its key and public URL. `contentType` must come
 * from sniffing the bytes, never from the client.
 */
export async function uploadScan(
	bytes: ArrayBuffer,
	contentType: ImageType,
	prefix = ''
): Promise<{ key: string; url: string }> {
	const key = `${prefix}${crypto.randomUUID()}.${EXT_BY_TYPE[contentType]}`;

	const c = client();
	const put = () =>
		c.fetch(`${bucketEndpoint()}/${key}`, {
			method: 'PUT',
			body: bytes,
			headers: { 'Content-Type': contentType }
		});

	let res = await put();

	// Self-heal a missing local bucket (fresh/restarted RustFS): create it, retry once.
	// Gated on isLocalStore() so it can never provision the prod R2 bucket.
	if (!res.ok && res.status === 404 && isLocalStore()) {
		const body = await res.text();
		if (body.includes('NoSuchBucket')) {
			await ensureLocalBucket(c);
			res = await put();
		} else {
			throw new Error(`R2 upload failed: 404 ${body}`);
		}
	}

	if (!res.ok) {
		// Surface status + body so the cause shows up in the function logs.
		throw new Error(`R2 upload failed: ${res.status} ${await res.text()}`);
	}

	return { key, url: `${required('R2_PUBLIC_URL')}/${key}` };
}

/**
 * The bucket key behind one of our public URLs, or null for any URL we didn't
 * serve (a legacy `/artefacts/...` path, another host). Keys may contain
 * slashes (`submissions/<draft>/<uuid>.webp`), so this strips the public-URL
 * base rather than taking the last path segment.
 */
export function keyFromUrl(url: string): string | null {
	const base = `${required('R2_PUBLIC_URL')}/`;
	if (!url.startsWith(base)) return null;
	const key = url.slice(base.length);
	// Refuse anything that could step outside the bucket's key space.
	if (!key || key.split('/').some((part) => part === '' || part === '.' || part === '..')) {
		return null;
	}
	return key;
}

/** The public URL an object key is served at. */
export function urlForKey(key: string): string {
	return `${required('R2_PUBLIC_URL')}/${key}`;
}

/** Delete an object from R2 by its bucket key. */
export async function deleteScan(key: string): Promise<void> {
	const c = client();
	const res = await c.fetch(`${bucketEndpoint()}/${key}`, {
		method: 'DELETE'
	});

	if (!res.ok && res.status !== 404) {
		throw new Error(`R2 delete failed: ${res.status} ${await res.text()}`);
	}
}

/** One stored object, as listed. */
export type StoredObject = { key: string; lastModified: Date };

const xmlUnescape = (value: string) =>
	value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');

/**
 * Every object under `prefix` (S3 ListObjectsV2, following continuation
 * tokens). The response is small, regular XML, so a regex reads it without
 * pulling in an XML parser.
 */
export async function listScans(prefix: string): Promise<StoredObject[]> {
	const c = client();
	const objects: StoredObject[] = [];
	let continuation: string | null = null;

	do {
		const query = new URLSearchParams({ 'list-type': '2', prefix });
		if (continuation) query.set('continuation-token', continuation);
		const res = await c.fetch(`${bucketEndpoint()}?${query}`);
		if (!res.ok) throw new Error(`R2 list failed: ${res.status} ${await res.text()}`);
		const xml = await res.text();

		for (const [, contents] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
			const key = contents.match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
			const modified = contents.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1];
			if (key && modified)
				objects.push({ key: xmlUnescape(key), lastModified: new Date(modified) });
		}
		const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
		const next = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
		continuation = truncated && next ? xmlUnescape(next) : null;
	} while (continuation);

	return objects;
}
