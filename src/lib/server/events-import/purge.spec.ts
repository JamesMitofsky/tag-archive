import { afterEach, describe, expect, it, vi } from 'vitest';
import { purgeArchiveCache, vercelProject } from './purge';

// Whether .vercel/project.json "exists": a checkout may or may not be linked,
// so the tests decide rather than the disk.
const link = vi.hoisted(() => ({ exists: false }));
vi.mock('node:fs', async (importOriginal) => {
	const fs = await importOriginal<typeof import('node:fs')>();
	return { ...fs, existsSync: () => link.exists };
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	link.exists = false;
});

describe('vercelProject', () => {
	it('reads the project and team from the environment', () => {
		vi.stubEnv('VERCEL_PROJECT_ID', 'prj_env');
		vi.stubEnv('VERCEL_ORG_ID', 'team_env');
		expect(vercelProject()).toEqual({ projectId: 'prj_env', teamId: 'team_env' });
	});

	it('refuses, naming the fix, when nothing links the project', () => {
		vi.stubEnv('VERCEL_PROJECT_ID', '');
		vi.stubEnv('VERCEL_ORG_ID', '');
		expect(() => vercelProject()).toThrow(/vercel link/);
	});
});

describe('purgeArchiveCache', () => {
	it('deletes the archive tag in the linked project and team', async () => {
		vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1');
		vi.stubEnv('VERCEL_ORG_ID', 'team_1');
		const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetch);

		await purgeArchiveCache('tok');

		expect(fetch).toHaveBeenCalledOnce();
		const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
		expect(url.origin + url.pathname).toBe(
			'https://api.vercel.com/v1/edge-cache/dangerously-delete-by-tags'
		);
		expect(url.searchParams.get('projectIdOrName')).toBe('prj_1');
		expect(url.searchParams.get('teamId')).toBe('team_1');
		expect(init.method).toBe('POST');
		expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok');
		// No target: production and previews share one database.
		expect(JSON.parse(init.body as string)).toEqual({ tags: ['archive'] });
	});

	it('throws with Vercel’s answer when the purge is refused', async () => {
		vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1');
		vi.stubEnv('VERCEL_ORG_ID', 'team_1');
		vi.stubGlobal('fetch', async () => new Response('{"error":"forbidden"}', { status: 403 }));
		await expect(purgeArchiveCache('tok')).rejects.toThrow(/403: \{"error":"forbidden"\}/);
	});
});
