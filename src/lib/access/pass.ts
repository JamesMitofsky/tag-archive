/**
 * The access pass: the signed cookie that opens the site. A visitor earns one
 * by tapping the garden's NFC tag (kind `t`, see src/routes/t); a signed-in
 * keeper is issued one automatically (kind `k`, see hooks.server.ts).
 *
 * A pass is good for PASS_TTL_MS from the moment it was minted, and it slides:
 * while the site is on the visitor's screen, the browser re-mints it through
 * POST /api/presence (see ./presence and src/routes/api/presence), so the site
 * drifts shut PASS_TTL_MS after it was last visible, not a fixed time after the
 * tap. The clock lives here, in the signed token, because a backgrounded mobile
 * tab cannot be trusted to run one.
 *
 * Checked in two runtimes — the Netlify edge function in front of everything
 * (Deno) and SvelteKit's hooks (Node) — so this module uses only Web Crypto and
 * imports nothing: the edge bundle loads it by relative path.
 *
 * The HMAC key is derived from BETTER_AUTH_SECRET exactly as
 * $lib/server/signing derives its purpose keys (purpose `access`), so the two
 * can never disagree about a signature; pass.spec.ts holds them together.
 */

export const PASS_COOKIE = 'tag_pass';
/** How long the site stays open after the visitor was last seen on it. */
export const PASS_TTL_MS = 20 * 60 * 1000;

export type PassKind = 't' | 'k';
/**
 * `issuedAt` is when this token was minted: the tap, or the latest presence
 * beat that re-minted it. So on a pass that has slid, it reads as "last seen".
 */
export type Pass = { kind: PassKind; issuedAt: number; expiresAt: number };

const VERSION = 'v1';
const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(raw: BufferSource, usages: KeyUsage[]): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

/** HMAC(secret, "tag-archive:access"), imported once per secret. */
function accessKey(secret: string): Promise<CryptoKey> {
	let key = keys.get(secret);
	if (!key) {
		key = (async () => {
			const root = await hmacKey(encoder.encode(secret), ['sign']);
			const derived = await crypto.subtle.sign('HMAC', root, encoder.encode('tag-archive:access'));
			return hmacKey(derived, ['sign', 'verify']);
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

const payload = (p: Pass) => `${VERSION}.${p.kind}.${p.issuedAt}.${p.expiresAt}`;

/** Mint a pass of `kind`, valid for `ttl` from `now`. */
export async function mintPass(
	secret: string,
	kind: PassKind,
	now = Date.now(),
	ttl = PASS_TTL_MS
): Promise<{ token: string; pass: Pass }> {
	const pass = { kind, issuedAt: now, expiresAt: now + ttl };
	const signature = await crypto.subtle.sign(
		'HMAC',
		await accessKey(secret),
		encoder.encode(payload(pass))
	);
	return { token: `${payload(pass)}.${toBase64Url(signature)}`, pass };
}

/** The pass in `token`, if it is genuine and unexpired at `now`; else null. */
export async function verifyPass(
	secret: string,
	token: string | null | undefined,
	now = Date.now()
): Promise<Pass | null> {
	if (!secret || !token) return null;
	const parts = token.split('.');
	if (parts.length !== 5 || parts[0] !== VERSION) return null;
	const [, kind, issued, expires, sig] = parts;
	const issuedAt = Number(issued);
	const expiresAt = Number(expires);
	if (kind !== 't' && kind !== 'k') return null;
	if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) return null;

	const pass: Pass = { kind, issuedAt, expiresAt };
	const signature = fromBase64Url(sig);
	if (!signature) return null;
	// subtle.verify compares in constant time.
	const genuine = await crypto.subtle.verify(
		'HMAC',
		await accessKey(secret),
		signature,
		encoder.encode(payload(pass))
	);
	return genuine && now < expiresAt ? pass : null;
}
