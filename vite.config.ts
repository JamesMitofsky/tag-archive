import adapter, { type Config as AdapterConfig } from '@sveltejs/adapter-vercel';
import { mdsvex } from 'mdsvex';
import { CDN_WIDTHS } from './src/lib/images/cdnWidths.js';
import { defineConfig } from 'vitest/config';

import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'node:path';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

const dirname = import.meta.dirname;

/** A regex source matching `text` exactly, special characters escaped. */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * The bucket's public origin and path, as the one remote pattern Vercel's image
 * optimizer may fetch from. Derived from R2_PUBLIC_URL so it can never drift
 * from where scans are actually served. Any other remote URL is refused.
 *
 * The patterns are regular expressions (the Build Output API's
 * `remotePatterns`), not globs, so the parts are escaped and anchored.
 *
 * On Vercel the build fails without it: a missing pattern would ship a site
 * whose every optimized scan answers 400. Elsewhere (local builds, checks,
 * tests) it is simply left out.
 */
function bucketImagePattern() {
	const raw = process.env.R2_PUBLIC_URL;

	if (!raw) {
		if (process.env.VERCEL) {
			throw new Error('R2_PUBLIC_URL must be set for the build, for the image optimizer');
		}

		return [];
	}

	const url = new URL(raw);
	const base = url.pathname.replace(/\/+$/, '');

	return [
		{
			protocol: url.protocol.slice(0, -1) as 'http' | 'https',
			hostname: `^${literal(url.hostname)}$`,
			port: url.port,
			pathname: `^${literal(base)}/.*$`
		}
	];
}

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
	plugins: [
		tailwindcss(),
		// SvelteKit 3 takes its config here; svelte.config.js is no longer read.
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			extensions: ['.svelte', '.svx', '.md'],
			preprocess: [mdsvex({ extensions: ['.svx', '.md'] })],
			// No `runtime`: the functions run the Node version the build ran on, which
			// Vercel picks from `engines.node` in package.json. Pinning it here too would
			// let the two drift.
			adapter: adapter({
				images: {
					sizes: [...CDN_WIDTHS],
					domains: [],
					remotePatterns: bucketImagePattern(),
					// No local images: the optimizer reads files from the deployment
					// itself, and whether it does so through the access gate is not
					// documented, so the gated scans in static/ never go near it.
					// OptimizedImage only sends it the bucket's URLs. (The adapter
					// writes this block verbatim, so the option reaches Vercel even
					// though the adapter's types don't list it.)
					localPatterns: [],
					// WebP alone, not AVIF as well: each format is its own
					// transformation, and the Hobby plan includes 5,000 a month.
					formats: ['image/webp'],

					// Bucket keys are random UUIDs, so an object never changes under its
					// URL: cache each transformation for the CDN's 31-day maximum, and
					// spend fewer of the plan's monthly transformations re-making them.
					minimumCacheTTL: 31 * 24 * 60 * 60
				} as AdapterConfig['images']
			})
		})
	],
	server: {
		// Bind every interface (not just ::1) so a phone on the same Wi-Fi can reach
		// the dev server at http://<mac-lan-ip>:5173, and so a tunnel (ngrok) can
		// forward to it over IPv4.
		host: true,
		// Vite rejects requests whose Host header it does not recognise (DNS-rebinding
		// guard). Tunnel domains are random per session, so allow the wildcards.
		allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.dev', '.ngrok.app']
	},
	optimizeDeps: {
		// Both load lazily, only when a photograph needs them (see $lib/images).
		// The WebP encoder finds its .wasm next to itself through
		// `new URL(…, import.meta.url)`, which pre-bundling into .vite/deps
		// breaks in dev; heic-to is a 3 MB self-contained libheif build that
		// gains nothing from pre-bundling but a slower cold start.
		exclude: ['@jsquash/webp', 'heic-to']
	},
	build: {
		// Declare a browser floor for the CSS minifier. Without it, esbuild treats a
		// vendor-prefixed property and its standard twin as one declaration and keeps
		// only the last in source order — which silently strips the `-webkit-` half of
		// Tailwind's `backdrop-blur-*` / `select-*` / `mask-*` output in production
		// builds (dev is unminified, so it looks fine locally).
		cssTarget: ['chrome110', 'firefox115', 'safari15', 'edge110']
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: true,
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: true,
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},

			{
				extends: true,
				plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
				test: {
					name: 'storybook',
					browser: {
						enabled: true,
						headless: true,
						provider: playwright({}),
						instances: [{ browser: 'chromium' }]
					}
				}
			}
		]
	}
});
