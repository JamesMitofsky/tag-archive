// Access rules a local dev bucket needs, shared by init-bucket.mjs and
// seed-images.mjs so whichever runs first leaves the bucket fully usable. Both
// steps are non-fatal: each returns null when applied, else what went wrong.
import { createHash } from 'node:crypto';

/** Grant anonymous read, so `${R2_PUBLIC_URL}/<key>` loads in the browser, as from an R2 public URL. */
export async function applyPublicRead(client, bucketUrl, bucket) {
	const policy = JSON.stringify({
		Version: '2012-10-17',
		Statement: [
			{
				Effect: 'Allow',
				Principal: { AWS: ['*'] },
				Action: ['s3:GetObject'],
				Resource: [`arn:aws:s3:::${bucket}/*`]
			}
		]
	});
	try {
		const res = await client.fetch(`${bucketUrl}?policy`, {
			method: 'PUT',
			body: policy,
			headers: { 'Content-Type': 'application/json' }
		});
		return res.ok ? null : `${res.status} ${await res.text()}`;
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
}

// Let the browser PUT photographs straight to the bucket with the presigned URLs
// the app issues (`presignPut` in src/lib/server/scans.ts). Wide open on origin,
// as only a throwaway local store ever gets it, reached from localhost, a LAN
// address or a tunnel alike. Keep it identical to LOCAL_CORS_XML in
// src/lib/server/scans.ts, which re-applies it when the app recreates a lost
// bucket. Prod's rule names the site's origins instead (scripts/r2-cors.mjs).
export const CORS_XML =
	'<CORSConfiguration><CORSRule>' +
	'<AllowedOrigin>*</AllowedOrigin>' +
	'<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod>' +
	'<AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader>' +
	'<MaxAgeSeconds>3600</MaxAgeSeconds>' +
	'</CORSRule></CORSConfiguration>';

/** Apply the CORS rule above. */
export async function applyCors(client, bucketUrl) {
	try {
		const res = await client.fetch(`${bucketUrl}?cors`, {
			method: 'PUT',
			body: CORS_XML,
			// S3 requires Content-MD5 on PutBucketCors.
			headers: {
				'Content-Type': 'application/xml',
				'Content-MD5': createHash('md5').update(CORS_XML).digest('base64')
			}
		});
		return res.ok ? null : `${res.status} ${await res.text()}`;
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
}

/** What to tell someone whose bucket refused the CORS rule. */
export const CORS_FALLBACK_HINT =
	'— photograph uploads from the browser will fail; set S3_UPLOAD_PROXY=1 in .env to route them through the app.';
