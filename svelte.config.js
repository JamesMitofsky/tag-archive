import adapter from '@sveltejs/adapter-vercel';
import { mdsvex } from 'mdsvex';
import { CDN_WIDTHS } from './src/lib/images/cdnWidths.js';

// Authoritative SvelteKit config. This is the canonical location that both
// SvelteKit and Vercel's build read from — do NOT pass these options inline to
// `sveltekit()` in vite.config.ts, or SvelteKit ignores this file and warns
// ("svelte.config.js is ignored when options are passed via your Vite config").

/** A regex source matching `text` exactly, special characters escaped. */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

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
			protocol: /** @type {'http' | 'https'} */ (url.protocol.slice(0, -1)),
			hostname: `^${literal(url.hostname)}$`,
			port: url.port,
			pathname: `^${literal(base)}/.*$`
		}
	];
}

export default {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	extensions: ['.svelte', '.svx', '.md'],
	preprocess: [mdsvex({ extensions: ['.svx', '.md'] })],
	kit: {
		// No `runtime`: the functions run the Node version the build ran on, which
		// `engines.node` in package.json sets. Pinning it here too would let the two drift.
		adapter: adapter({
			images: /** @type {import('@sveltejs/adapter-vercel').Config['images']} */ ({
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
			})
		}),
		typescript: {
			config: (config) => {
				config.include.push('../drizzle.config.ts', '../middleware.ts');
			}
		},
		alias: {
			'@/*': './path/to/lib/*'
		}
	}
};
