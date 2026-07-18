// Seed the local dev bucket with sample scan images and attach them to a handful
// of artefacts — the storage counterpart to `db:seed`. Runs at dev boot (after
// init-bucket, once RustFS + the DB are up) and can be re-run by hand with
// `pnpm db:seed:images`.
//
// Local-only by design, two ways:
//   • no S3_ENDPOINT  → assume remote R2 (prod); skip. Never touches prod storage.
//   • remote DATABASE_URL (libsql:// / https://) → refuse. Never rewrites prod rows.
//
// The store is intentionally ephemeral (fresh RustFS each boot), so this re-uploads
// and re-attaches every time — deterministic subset, idempotent.
import { AwsClient } from 'aws4fetch';
import { createClient } from '@libsql/client';

const {
	R2_ACCESS_KEY_ID,
	R2_SECRET_ACCESS_KEY,
	R2_BUCKET,
	R2_PUBLIC_URL,
	S3_ENDPOINT,
	S3_REGION = 'auto',
	DATABASE_URL,
	DATABASE_AUTH_TOKEN
} = process.env;

if (!S3_ENDPOINT) {
	console.log('[seed-images] no S3_ENDPOINT — assuming remote R2, skipping.');
	process.exit(0);
}
if (!R2_PUBLIC_URL) {
	console.error('[seed-images] S3_ENDPOINT set but R2_PUBLIC_URL missing — cannot build public URLs.');
	process.exit(1);
}
if (!DATABASE_URL) {
	console.error('[seed-images] DATABASE_URL is not set.');
	process.exit(1);
}
if (DATABASE_URL.startsWith('libsql://') || DATABASE_URL.startsWith('https://')) {
	throw new Error(`Refusing to seed images against a remote database (${DATABASE_URL}). Local-only.`);
}

// How many artefacts get a sample scan attached.
const ATTACH_COUNT = 6;

// Distinct backdrops so seeded artefacts are visually told apart.
const COLORS = ['#b45309', '#0f766e', '#7c3aed', '#be123c', '#1d4ed8', '#4d7c0f'];

/** A labelled placeholder scan as an SVG (dependency-free, renders in any browser). */
function placeholderSvg(title, i) {
	const bg = COLORS[i % COLORS.length];
	const safe = String(title ?? 'Artefact')
		.replace(/[<>&]/g, ' ')
		.slice(0, 40);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
	<rect width="800" height="600" fill="${bg}"/>
	<text x="400" y="290" fill="white" font-family="sans-serif" font-size="34" font-weight="600" text-anchor="middle">${safe}</text>
	<text x="400" y="340" fill="rgba(255,255,255,0.75)" font-family="sans-serif" font-size="20" text-anchor="middle">Sample seeded scan</text>
</svg>`;
}

const client = new AwsClient({
	accessKeyId: R2_ACCESS_KEY_ID,
	secretAccessKey: R2_SECRET_ACCESS_KEY,
	region: S3_REGION,
	service: 's3'
});
const bucketUrl = `${S3_ENDPOINT}/${R2_BUCKET}`;

// Wait for the store to accept connections (container may still be booting).
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
	console.error('[seed-images] storage never came up at', S3_ENDPOINT);
	process.exit(1);
}

// Ensure the bucket exists (idempotent; init-bucket usually created it already).
const created = await client.fetch(bucketUrl, { method: 'PUT' });
if (!created.ok && created.status !== 409) {
	console.error('[seed-images] bucket create failed:', created.status, await created.text());
	process.exit(1);
}

// Grant anonymous read so the seeded `${R2_PUBLIC_URL}/<key>` URLs load in the browser.
// Re-applied here (not just in init-bucket) so a standalone `pnpm db:seed:images` works.
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
if (!policySet.ok) {
	console.warn('[seed-images] public-read policy not set:', policySet.status, await policySet.text());
}

// Pick the artefacts to decorate — lowest ids, so it's stable across runs.
const db = createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN });
const { rows } = await db.execute({
	sql: 'SELECT id, artefact FROM artefact ORDER BY id LIMIT ?',
	args: [ATTACH_COUNT]
});

if (!rows.length) {
	console.log('[seed-images] no artefacts found — run `pnpm db:seed` first. Nothing to attach.');
	process.exit(0);
}

let attached = 0;
for (let i = 0; i < rows.length; i++) {
	const { id, artefact } = rows[i];
	const key = `seed/${id}.svg`;
	const svg = placeholderSvg(artefact, i);

	const put = await client.fetch(`${bucketUrl}/${key}`, {
		method: 'PUT',
		body: svg,
		headers: { 'Content-Type': 'image/svg+xml' }
	});
	if (!put.ok) {
		console.error('[seed-images] upload failed for artefact', id, put.status, await put.text());
		continue;
	}

	await db.execute({
		sql: 'UPDATE artefact SET file_urls = ? WHERE id = ?',
		args: [JSON.stringify([`${R2_PUBLIC_URL}/${key}`]), id]
	});
	attached++;
}

console.log(`[seed-images] attached ${attached} sample scan(s) to artefacts.`);
