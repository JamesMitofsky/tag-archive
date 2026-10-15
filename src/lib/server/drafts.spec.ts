import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { BETTER_AUTH_SECRET: 'test-secret' } }));

const { DRAFT_COOKIE, issueDraft, mintDraftToken, parseDraftToken, readDraft } =
	await import('./drafts');

/** Just enough of SvelteKit's cookie jar for these helpers. */
function jar(initial?: string): Cookies {
	const store = new Map<string, string>();
	if (initial) store.set(DRAFT_COOKIE, initial);
	return {
		get: (name: string) => store.get(name),
		set: (name: string, value: string) => void store.set(name, value)
	} as unknown as Cookies;
}

describe('draft tokens', () => {
	it('round-trips a freshly minted token', () => {
		const { token, draft } = mintDraftToken(undefined, 1_000);
		expect(parseDraftToken(token)).toEqual(draft);
		expect(draft.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
	});

	it('rejects a token whose id or timestamp was altered', () => {
		const { token } = mintDraftToken(undefined, 1_000);
		const [id, issued, signature] = token.split('.');
		const otherId = mintDraftToken(undefined, 1_000).draft.id;
		expect(parseDraftToken(`${otherId}.${issued}.${signature}`)).toBeNull();
		expect(parseDraftToken(`${id}.${Number(issued) + 1}.${signature}`)).toBeNull();
		expect(parseDraftToken(`${id}.${issued}`)).toBeNull();
		expect(parseDraftToken('garbage')).toBeNull();
	});

	it('keeps no clock of its own: a draft reads the same however long ago it was issued', () => {
		// Permission to write is the access pass's question ($lib/access/pass).
		const cookies = jar(mintDraftToken(undefined, 0).token);
		expect(readDraft(cookies)?.issuedAt).toBe(0);
	});

	it('keeps the same id on re-issue, so earlier uploads stay attachable', () => {
		const first = mintDraftToken(undefined, 0);
		const cookies = jar(first.token);
		const renewed = issueDraft(cookies, 7 * 24 * 60 * 60 * 1000);
		expect(renewed.id).toBe(first.draft.id);
		expect(readDraft(cookies)).toEqual(renewed);
	});

	it('mints a new id when the old cookie is forged', () => {
		const cookies = jar('forged.0.signature');
		expect(issueDraft(cookies).id).not.toBe('forged');
	});
});
