import { AwsClient } from 'aws4fetch';
import { env } from '$env/dynamic/private';

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

// Map upload content types to file extensions for the stored object key.
const EXT_BY_TYPE: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/heic': 'heic',
	'image/heif': 'heif'
};

/** Upload bytes to R2 under a fresh random key; return its public URL. */
export async function uploadScan(
	bytes: ArrayBuffer,
	contentType = 'image/jpeg'
): Promise<{ key: string; url: string }> {
	const ext = EXT_BY_TYPE[contentType] ?? 'bin';
	const key = `${crypto.randomUUID()}.${ext}`;

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

/** Delete an object from R2 by key or public URL. */
export async function deleteScan(urlOrKey: string): Promise<void> {
	const key = urlOrKey.split('/').pop();
	if (!key) return;

	const c = client();
	const res = await c.fetch(`${bucketEndpoint()}/${key}`, {
		method: 'DELETE'
	});

	if (!res.ok && res.status !== 404) {
		throw new Error(`R2 delete failed: ${res.status} ${await res.text()}`);
	}
}
