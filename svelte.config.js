import adapter from '@sveltejs/adapter-netlify';

// NOTE: The authoritative SvelteKit config is passed inline to `sveltekit()` in
// vite.config.ts. Since SvelteKit 2.62 that inline config takes precedence and
// this file is ignored by SvelteKit itself. It exists so Netlify's build system
// detects the framework as SvelteKit and wires the SSR function + catch-all
// redirect during deploy. Keep the adapter here in sync with vite.config.ts.
export default {
	kit: {
		adapter: adapter()
	}
};
