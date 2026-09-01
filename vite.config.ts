import { defineConfig } from 'vitest/config';

import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

const dirname =
	typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
	plugins: [
		tailwindcss(),
		// SvelteKit config lives in svelte.config.js (the canonical location).
		// Passing options here would make SvelteKit ignore that file and warn.
		sveltekit()
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
				extends: './vite.config.ts',
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
				extends: './vite.config.ts',
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
