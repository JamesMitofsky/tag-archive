// Prepare the local dev bucket (RustFS, an S3-compatible object store): wait
// for the server, create the bucket, and grant anonymous read so the app's public
// file URLs resolve — mirroring an R2 bucket with a Public Development URL. No-op
// unless S3_ENDPOINT is set (i.e. remote R2 in prod).
//
// Run with `node --env-file-if-exists=.env` so the dev credentials load, while any
// endpoint/region exported by the Conductor run script still take precedence.
import { AwsClient } from 'aws4fetch';

const {
	R2_ACCESS_KEY_ID,
	R2_SECRET_ACCESS_KEY,
	R2_BUCKET,
	S3_ENDPOINT,
	S3_REGION = 'auto'
} = process.env;

if (!S3_ENDPOINT) {
	console.log('[init-bucket] no S3_ENDPOINT — assuming remote R2, skipping.');
	process.exit(0);
}

const client = new AwsClient({
	accessKeyId: R2_ACCESS_KEY_ID,
	secretAccessKey: R2_SECRET_ACCESS_KEY,
	region: S3_REGION,
	service: 's3'
});
const bucketUrl = `${S3_ENDPOINT}/${R2_BUCKET}`;

// Wait for the server to accept connections (container may still be booting).
// Engine-agnostic: any HTTP response — even 403/404 — means it's listening.
let live = false;
for (let i = 0; i < 60; i++) {
	try {
		await fetch(S3_ENDPOINT);
		live = true;
		break;
	} catch {
		// connection refused — not up yet
	}
	await new Promise((r) => setTimeout(r, 500));
}
if (!live) {
	console.error('[init-bucket] storage never came up at', S3_ENDPOINT);
	process.exit(1);
}

// Create the bucket (idempotent — S3 returns 409 if it already exists).
const created = await client.fetch(bucketUrl, { method: 'PUT' });
if (created.ok || created.status === 409) {
	console.log('[init-bucket] bucket ready:', R2_BUCKET);
} else {
	console.error('[init-bucket] create failed:', created.status, await created.text());
	process.exit(1);
}

// Grant public read on the objects, so `${R2_PUBLIC_URL}/<key>` is fetchable.
const policy = JSON.stringify({
	Version: '2012-10-17',
	Statement: [
		{
			Effect: 'Allow',
			Principal: { AWS: ['*'] },
			Action: ['s3:GetObject'],
			Resource: [`arn:aws:s3:::${R2_BUCKET}/*`]
		}
	]
});
const policySet = await client.fetch(`${bucketUrl}?policy`, {
	method: 'PUT',
	body: policy,
	headers: { 'Content-Type': 'application/json' }
});
if (policySet.ok) {
	console.log('[init-bucket] public-read policy applied.');
} else {
	// Non-fatal: uploads still work; only browser-facing public GETs might 403 if
	// the engine doesn't support PutBucketPolicy. Dev boots regardless.
	console.warn('[init-bucket] public-read policy not set:', policySet.status, await policySet.text());
}
