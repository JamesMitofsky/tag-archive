import { randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { PASS_TTL_MS } from '$lib/access/pass';
import { sign, verify } from './signing';

/**
 * Draft sessions: how an anonymous visitor on /contribute is allowed to write.
 *
 * Tapping the garden's NFC tag (src/routes/t) issues a signed cookie naming a
 * random draft id, alongside the access pass that opens the site. That id is
 * the visitor's private upload space: their images are stored under
 * `submissions/<id>/`, only that cookie may delete from it, and a submission
 * may only attach images from it. Nothing is stored server-side — the
 * signature is the whole proof.
 *
 * A draft is fresh for DRAFT_TTL_MS, the same window as the access pass. Past
 * that, uploads and submits need another tap; renewing keeps the same id (the
 * old signature still proves ownership), so images already uploaded stay
 * attachable.
 */

export const DRAFT_COOKIE = 'tag_draft';
export const DRAFT_TTL_MS = PASS_TTL_MS;
/** How long the browser keeps the cookie — longer than freshness, so renewal can reuse the id. */
const COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

export type Draft = { id: string; issuedAt: number; expiresAt: number };

const DRAFT_ID_RE = /^[A-Za-z0-9_-]{22}$/;

function payload(id: string, issuedAt: number): string {
	return `${id}.${issuedAt}`;
}

/** Parse and verify a raw cookie value. Freshness is the caller's question. */
export function parseDraftToken(token: string | undefined): Draft | null {
	if (!token) return null;
	const [id, issued, signature] = token.split('.');
	const issuedAt = Number(issued);
	if (!id || !DRAFT_ID_RE.test(id) || !Number.isSafeInteger(issuedAt) || !signature) return null;
	if (!verify('draft', payload(id, issuedAt), signature)) return null;
	return { id, issuedAt, expiresAt: issuedAt + DRAFT_TTL_MS };
}

/** The visitor's draft, if their cookie carries a valid signature (fresh or not). */
export function readDraft(cookies: Cookies): Draft | null {
	return parseDraftToken(cookies.get(DRAFT_COOKIE));
}

/** The visitor's draft only while it is still fresh enough to write with. */
export function freshDraft(cookies: Cookies, now = Date.now()): Draft | null {
	const draft = readDraft(cookies);
	return draft && now < draft.expiresAt ? draft : null;
}

/** Mint a signed draft token for `id` (a new random id when omitted). */
export function mintDraftToken(id = randomBytes(16).toString('base64url'), now = Date.now()) {
	return {
		token: `${payload(id, now)}.${sign('draft', payload(id, now))}`,
		draft: { id, issuedAt: now, expiresAt: now + DRAFT_TTL_MS }
	};
}

/**
 * Issue (or renew) the visitor's draft. Renewal keeps a validly signed id, even
 * an expired one, so the images already uploaded under it stay theirs.
 */
export function issueDraft(cookies: Cookies, now = Date.now()): Draft {
	const { token, draft } = mintDraftToken(readDraft(cookies)?.id, now);
	cookies.set(DRAFT_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: COOKIE_MAX_AGE_S
	});
	return draft;
}

/** Storage key prefix for a draft's uploads. */
export function submissionPrefix(draftId: string): string {
	return `submissions/${draftId}/`;
}
