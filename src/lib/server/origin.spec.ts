import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));
const { siteOrigin } = await import('./origin');

beforeEach(() => {
	for (const key of Object.keys(env)) delete env[key];
});

describe('siteOrigin', () => {
	it('is ORIGIN in production and locally', () => {
		env.ORIGIN = 'https://archive.example';
		expect(siteOrigin()).toBe('https://archive.example');
		env.VERCEL_ENV = 'production';
		env.VERCEL_URL = 'tag-archive-abc123-team.vercel.app';
		expect(siteOrigin()).toBe('https://archive.example');
	});

	it("is a preview deployment's own URL there, whatever ORIGIN says", () => {
		env.ORIGIN = 'https://archive.example';
		env.VERCEL_ENV = 'preview';
		env.VERCEL_URL = 'tag-archive-abc123-team.vercel.app';
		expect(siteOrigin()).toBe('https://tag-archive-abc123-team.vercel.app');
	});

	it('falls back to ORIGIN on a preview without its URL, and is undefined without either', () => {
		env.VERCEL_ENV = 'preview';
		expect(siteOrigin()).toBeUndefined();
		env.ORIGIN = 'https://archive.example';
		expect(siteOrigin()).toBe('https://archive.example');
	});

	it('treats an empty ORIGIN as unset', () => {
		env.ORIGIN = '';
		expect(siteOrigin()).toBeUndefined();
	});
});
