import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { BETTER_AUTH_SECRET: 'test-secret' } }));

const { DRAFT_COOKIE, DRAFT_TTL_MS, freshDraft, issueDraft, mintDraftToken, parseDraftToken } =
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
		// Pushing the timestamp forward would extend a session for free.
		expect(parseDraftToken(`${id}.${Number(issued) + 1}.${signature}`)).toBeNull();
		expect(parseDraftToken(`${id}.${issued}`)).toBeNull();
		expect(parseDraftToken('garbage')).toBeNull();
	});

	it('is fresh until its TTL runs out, then needs renewal', () => {
		const cookies = jar(mintDraftToken(undefined, 0).token);
		expect(freshDraft(cookies, DRAFT_TTL_MS - 1)).not.toBeNull();
		expect(freshDraft(cookies, DRAFT_TTL_MS)).toBeNull();
	});

	it('keeps the same id on renewal, so earlier uploads stay attachable', () => {
		const first = mintDraftToken(undefined, 0);
		const cookies = jar(first.token);
		const renewed = issueDraft(cookies, DRAFT_TTL_MS * 2);
		expect(renewed.id).toBe(first.draft.id);
		expect(freshDraft(cookies, DRAFT_TTL_MS * 2)).toEqual(renewed);
	});

	it('mints a new id when the old cookie is forged', () => {
		const cookies = jar('forged.0.signature');
		expect(issueDraft(cookies).id).not.toBe('forged');
	});
});
