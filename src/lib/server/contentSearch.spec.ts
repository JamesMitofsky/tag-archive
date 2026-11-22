import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv(env));
// The database is never reached in these cases; this keeps it from being opened.
vi.mock('./db', () => ({ client: {} }));

const { embedMissing, embeddingConfig, searchByContent } = await import('./contentSearch');

beforeEach(() => {
	for (const key of Object.keys(env)) delete env[key];
});

describe('embeddingConfig', () => {
	it('runs in R2’s account unless told otherwise', () => {
		env.CLOUDFLARE_AI_TOKEN = 'tok';
		env.R2_ACCOUNT_ID = 'r2-acct';
		expect(embeddingConfig()).toEqual({ token: 'tok', accountId: 'r2-acct' });
		env.CLOUDFLARE_ACCOUNT_ID = 'ai-acct';
		expect(embeddingConfig()).toEqual({ token: 'tok', accountId: 'ai-acct' });
	});

	it('is off without a token or an account', () => {
		env.R2_ACCOUNT_ID = 'r2-acct';
		expect(embeddingConfig()).toBeNull();
		delete env.R2_ACCOUNT_ID;
		env.CLOUDFLARE_AI_TOKEN = 'tok';
		expect(embeddingConfig()).toBeNull();
	});
});

describe('switched off', () => {
	it('finds nothing and embeds nothing, calling no one', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		expect(await searchByContent('flower')).toEqual([]);
		expect(await embedMissing(1000, async () => null)).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
