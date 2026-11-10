// Prepare the local dev bucket (RustFS, an S3-compatible object store): wait
// for the server, create the bucket, grant anonymous read so the app's public
// file URLs resolve — mirroring an R2 bucket with a Public Development URL — and
// allow the browser's cross-origin PUTs (CORS), which photograph uploads make
// straight to the bucket. No-op unless S3_ENDPOINT is set (i.e. remote R2 in
// prod, whose CORS rule `pnpm storage:cors` applies).
//
// Run with `node --env-file-if-exists=.env` so the dev credentials load, while any
// endpoint/region exported by the Conductor run script still take precedence.
import { AwsClient } from 'aws4fetch';
import { applyCors, applyPublicRead, CORS_FALLBACK_HINT } from './local-bucket.mjs';

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
const policyProblem = await applyPublicRead(client, bucketUrl, R2_BUCKET);
if (policyProblem === null) {
	console.log('[init-bucket] public-read policy applied.');
} else {
	// Non-fatal: uploads still work; only browser-facing public GETs might 403 if
	// the engine doesn't support PutBucketPolicy. Dev boots regardless.
	console.warn('[init-bucket] public-read policy not set:', policyProblem);
}

// Let the browser PUT photographs straight to the bucket (see ./local-bucket.mjs).
const corsProblem = await applyCors(client, bucketUrl);
if (corsProblem === null) {
	console.log('[init-bucket] CORS rule applied (browser uploads go straight to the bucket).');
} else {
	// Non-fatal: scans post through the app and are unaffected. Photograph
	// uploads would fail their CORS preflight, and S3_UPLOAD_PROXY=1 in .env
	// routes them through the app (/api/images/put) instead.
	console.warn('[init-bucket] CORS rule not set:', corsProblem, CORS_FALLBACK_HINT);
}
