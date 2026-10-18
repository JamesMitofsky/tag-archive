import { createHash } from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { PresignedPut } from '$lib/images/types';
import type { ImageType } from './imageType';
import { sign, verify } from './signing';

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

/** One `/`-separated segment of a plain key (see `isPlainKey`). */
const KEY_SEGMENT_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/**
 * Whether `key` is a plain bucket key: `/`-separated segments of letters,
 * digits, `.`, `_` and `-`, none empty and none starting with a dot. Every key
 * the archive issues is one (`<uuid>.<ext>`, `submissions/<draft>/…`,
 * `seed/<id>.svg`, the photograph layout in ./imageKeys).
 *
 * An allow-list, because the URL parser that builds each bucket request
 * rewrites far more than a literal `..`: `%2e%2e`, `.%2E`, backslashes, and
 * dots split by a tab or newline (which it strips) all step up a folder, and
 * `?` or `#` end the path. So a key that isn't plain could address some other
 * object than the one it names.
 */
export function isPlainKey(key: string): boolean {
	return key.split('/').every((segment) => KEY_SEGMENT_RE.test(segment));
}

/**
 * The bucket URL of `key`. Every request for one object goes through here, so
 * a key that isn't plain is refused whichever caller let it through.
 */
function objectUrl(key: string): string {
	if (!isPlainKey(key)) throw new Error(`Not a plain bucket key: ${JSON.stringify(key)}`);
	return `${bucketEndpoint()}/${key}`;
}

// True only when pointed at a local RustFS (S3_ENDPOINT set by the dev run scripts).
// Prod derives its host from R2_ACCOUNT_ID and leaves S3_ENDPOINT unset — so the
// self-heal below can never fire against the real R2 bucket.
export function isLocalStore(): boolean {
	return !!env.S3_ENDPOINT;
}

/**
 * The CORS rule a local bucket gets, so the browser can PUT straight to it with
 * a presigned URL (see `presignPut`). Wide open on origin because it only ever
 * applies to a throwaway local store; prod's rule names the site's origins
 * (built by scripts/r2-cors.mjs and applied with `pnpm storage:cors`).
 */
const LOCAL_CORS_XML =
	'<CORSConfiguration><CORSRule>' +
	'<AllowedOrigin>*</AllowedOrigin>' +
	'<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod>' +
	'<AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader>' +
	'<MaxAgeSeconds>3600</MaxAgeSeconds>' +
	'</CORSRule></CORSConfiguration>';

// Local dev is intentionally ephemeral: each `pnpm dev` starts a fresh RustFS with no
// bucket. `init-bucket.mjs` provisions it at boot, but a container-only restart wipes
// it again. Rather than persist data, recreate the bucket on demand — mirrors
// init-bucket.mjs (bucket PUT, public-read policy, CORS rule). Dev-only; never runs in prod.
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

	// Non-fatal too: without it the browser's presigned PUTs fail their preflight,
	// and S3_UPLOAD_PROXY=1 routes them through the app instead (see `uploadTarget`).
	// S3 requires Content-MD5 on this call.
	await c
		.fetch(`${url}?cors`, {
			method: 'PUT',
			body: LOCAL_CORS_XML,
			headers: {
				'Content-Type': 'application/xml',
				'Content-MD5': createHash('md5').update(LOCAL_CORS_XML).digest('base64')
			}
		})
		.catch(() => {});
}

// File extension for each sniffed image type (see $lib/server/imageType).
const EXT_BY_TYPE: Record<ImageType, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/heic': 'heic'
};

/** File extension an object of a sniffed image type is stored under. */
export function extensionFor(type: ImageType): string {
	return EXT_BY_TYPE[type];
}

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
	await putObject(key, bytes, contentType);
	return { key, url: `${required('R2_PUBLIC_URL')}/${key}` };
}

/**
 * Write bytes under `key`, stored with `contentType`. The caller vouches for
 * the type: it must come from sniffing, or from a signature over it.
 */
export async function putObject(
	key: string,
	bytes: ArrayBuffer | Uint8Array,
	contentType: string
): Promise<void> {
	const url = objectUrl(key);
	const c = client();
	const put = () =>
		c.fetch(url, {
			method: 'PUT',
			body: bytes as BodyInit,
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
}

/**
 * A presigned PUT for `key`: the browser uploads straight to the bucket, so
 * large originals never pass through a function (whose request body caps at
 * ~6 MB). Both `Content-Type` and `Content-Length` are signed in, so the
 * bucket refuses the PUT unless it carries exactly the type the server agreed
 * to store and exactly `size` bytes — a URL issued for a 3 MB photo can't
 * carry 5 GB, nor store image bytes as `text/html` on the public host.
 */
export async function presignPut(
	key: string,
	contentType: string,
	size: number,
	expiresSeconds = 900
): Promise<string> {
	const url = new URL(objectUrl(key));
	url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
	const signed = await client().sign(url.toString(), {
		method: 'PUT',
		headers: { 'Content-Type': contentType, 'Content-Length': String(size) },
		aws: { signQuery: true, allHeaders: true }
	});
	return signed.url;
}

/**
 * Local dev only: route the browser's uploads through the app
 * (src/routes/api/images/put) rather than straight to the store, for when the
 * local store refuses the browser's CORS preflight, or when a phone on the LAN
 * can't reach the store's 127.0.0.1 address. Set S3_UPLOAD_PROXY=1 to opt in.
 */
export function usesUploadProxy(): boolean {
	return dev && isLocalStore() && env.S3_UPLOAD_PROXY === '1';
}

const PROXY_PATH = '/api/images/put';
const proxyPayload = (key: string, contentType: string, size: number, expires: number) =>
	[key, contentType, size, expires].join('\n');

/**
 * Where the browser PUTs one object: a presigned bucket URL, or (see
 * `usesUploadProxy`) the dev proxy, carrying an HMAC over the same terms a
 * presigned URL signs.
 */
export async function uploadTarget(
	key: string,
	contentType: string,
	size: number,
	expiresSeconds = 900,
	now = Date.now()
): Promise<PresignedPut> {
	const headers = { 'Content-Type': contentType };
	if (!usesUploadProxy()) {
		return { url: await presignPut(key, contentType, size, expiresSeconds), headers };
	}
	const expires = now + expiresSeconds * 1000;
	const query = new URLSearchParams({
		key,
		type: contentType,
		size: String(size),
		exp: String(expires),
		sig: sign('image-put', proxyPayload(key, contentType, size, expires))
	});
	return { url: `${PROXY_PATH}?${query}`, headers };
}

/** The terms of a dev-proxy upload URL, if its signature holds and it hasn't expired. */
export function verifyProxyPut(
	params: URLSearchParams,
	now = Date.now()
): { key: string; contentType: string; size: number } | null {
	const key = params.get('key') ?? '';
	const contentType = params.get('type') ?? '';
	const size = Number(params.get('size'));
	const expires = Number(params.get('exp'));
	const sig = params.get('sig') ?? '';
	if (!key || !contentType || !Number.isSafeInteger(size) || size < 0) return null;
	if (!Number.isSafeInteger(expires) || expires < now) return null;
	if (!verify('image-put', proxyPayload(key, contentType, size, expires), sig)) return null;
	return { key, contentType, size };
}

/**
 * Read an object back from the bucket (with credentials, so it works whether
 * or not the bucket is public). `range` is inclusive, as HTTP ranges are.
 * Resolves to the response for a 200/206, or for a 416 (a range request
 * against an empty object: treat as zero bytes); null when there is no such
 * object. Throws on anything else.
 */
export async function fetchObject(
	key: string,
	range?: { start: number; end: number }
): Promise<Response | null> {
	const res = await client().fetch(objectUrl(key), {
		headers: range ? { Range: `bytes=${range.start}-${range.end}` } : {}
	});
	if (res.ok || res.status === 416) return res;
	const body = await res.text();
	if (res.status === 404) return null;
	throw new Error(`R2 read failed: ${res.status} ${body}`);
}

/**
 * The bucket key behind one of our public URLs, or null for any URL we didn't
 * serve (a legacy `/artefacts/...` path, another host). Keys may contain
 * slashes (`submissions/<draft>/<uuid>.webp`), so this strips the public-URL
 * base rather than taking the last path segment.
 *
 * Only a plain key (see `isPlainKey`) comes back: callers judge ownership by
 * the key's text (its `submissions/<draft>/` prefix) and whether it is in use
 * by comparing it with stored URLs, so the key must name the object a bucket
 * request for it would reach.
 */
export function keyFromUrl(url: string): string | null {
	const base = `${required('R2_PUBLIC_URL')}/`;
	if (!url.startsWith(base)) return null;
	const key = url.slice(base.length);
	return isPlainKey(key) ? key : null;
}

/** The public URL an object key is served at. */
export function urlForKey(key: string): string {
	return `${required('R2_PUBLIC_URL')}/${key}`;
}

/** Delete an object from R2 by its bucket key. */
export async function deleteScan(key: string): Promise<void> {
	const res = await client().fetch(objectUrl(key), { method: 'DELETE' });

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
