/**
 * File grants: signed URLs that let a listener (see #lib/roles) fetch the scans
 * of the artefacts chosen for them when those scans are files of the
 * deployment itself (`static/artefacts/`), not objects in the bucket.
 *
 * Why a signature and not the pass: a listener's pass opens only their own
 * page (see `passOpens` in ./gate), and the gate in front of static files is
 * Vercel's Routing Middleware, which cannot read the database to learn which
 * artefacts are theirs. So the page that can, src/routes/listening, signs each
 * of their files' paths, and the middleware checks the signature: a grant
 * names one path and opens nothing else. Scans in the bucket need none, since
 * the bucket's URLs are public (see the README's known limits).
 *
 * A grant runs out at `expiresAt`, rounded up to the hour by the page so that
 * every load within the hour signs the same URL and the browser's cache keeps
 * serving it. It is not tied to the pass: an image the page has already shown
 * the listener gives a copied link nothing more than what they were shown.
 *
 * Only Web Crypto, and imports nothing, like ./pass: the middleware bundle
 * loads this file by relative path. The key is derived from BETTER_AUTH_SECRET
 * for its own purpose (`listener-file`), so a grant can never pass for a pass.
 */

/** The query parameter a granted file's URL carries. */
export const GRANT_PARAM = 'grant';

/** The only files a grant can open: the scans shipped with the deployment. */
export const GRANTABLE_PREFIX = '/artefacts/';

const VERSION = 'v1';
const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

/** HMAC(secret, "tag-archive:listener-file"), imported once per secret. */
function grantKey(secret: string): Promise<CryptoKey> {
	let key = keys.get(secret);
	if (!key) {
		key = (async () => {
			const raw = encoder.encode(secret);
			const root = await crypto.subtle.importKey(
				'raw',
				raw,
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['sign']
			);
			const derived = await crypto.subtle.sign(
				'HMAC',
				root,
				encoder.encode('tag-archive:listener-file')
			);
			return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, [
				'sign',
				'verify'
			]);
		})();
		keys.set(secret, key);
	}
	return key;
}

function toBase64Url(bytes: ArrayBuffer): string {
	let binary = '';
	for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
	try {
		const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
		return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
	} catch {
		return null;
	}
}

/**
 * The path a grant signs: the URL's pathname as the URL parser spells it, so a
 * file named with spaces is signed as `%20` and checked as `%20`. The middleware
 * reads `new URL(request.url).pathname`, which spells it the same way.
 */
export function grantPath(href: string): string {
	return new URL(href, 'http://grant.invalid').pathname;
}

/** Whether a grant can name `href` at all (a file under GRANTABLE_PREFIX). */
export function isGrantable(href: string): boolean {
	return (
		href.startsWith('/') && !href.startsWith('//') && grantPath(href).startsWith(GRANTABLE_PREFIX)
	);
}

const payload = (pathname: string, expiresAt: number) => `${VERSION}.${expiresAt}.${pathname}`;

/**
 * `href` with a grant good until `expiresAt` (ms epoch). Only for a grantable
 * file (see `isGrantable`); anything else comes back as it was.
 */
export async function grantFile(secret: string, href: string, expiresAt: number): Promise<string> {
	if (!secret || !isGrantable(href)) return href;
	const pathname = grantPath(href);
	const signature = await crypto.subtle.sign(
		'HMAC',
		await grantKey(secret),
		encoder.encode(payload(pathname, expiresAt))
	);
	return `${pathname}?${GRANT_PARAM}=${expiresAt}.${toBase64Url(signature)}`;
}

/**
 * Whether a request for `pathname` with query string `search` carries a
 * genuine, unexpired grant for exactly that file. Reads only: a grant is for
 * fetching a file, and never opens a write.
 */
export async function verifyFileGrant(
	secret: string | undefined,
	request: { pathname: string; search: string; method: string },
	now = Date.now()
): Promise<boolean> {
	if (!secret) return false;
	if (request.method !== 'GET' && request.method !== 'HEAD') return false;
	if (!request.pathname.startsWith(GRANTABLE_PREFIX)) return false;

	const token = new URLSearchParams(request.search).get(GRANT_PARAM);
	if (!token) return false;
	const dot = token.indexOf('.');
	if (dot === -1) return false;
	const expiresAt = Number(token.slice(0, dot));
	if (!Number.isSafeInteger(expiresAt) || now >= expiresAt) return false;
	const signature = fromBase64Url(token.slice(dot + 1));
	if (!signature) return false;

	// subtle.verify compares in constant time.
	return crypto.subtle.verify(
		'HMAC',
		await grantKey(secret),
		signature,
		encoder.encode(payload(request.pathname, expiresAt))
	);
}
