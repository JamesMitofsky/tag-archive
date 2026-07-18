import adapter from '@sveltejs/adapter-netlify';
import { mdsvex } from 'mdsvex';

// Authoritative SvelteKit config. This is the canonical location that both
// SvelteKit and Netlify's build system read from — do NOT pass these options
// inline to `sveltekit()` in vite.config.ts, or SvelteKit ignores this file
// and warns ("svelte.config.js is ignored when options are passed via your
// Vite config").
export default {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	extensions: ['.svelte', '.svx', '.md'],
	preprocess: [mdsvex({ extensions: ['.svx', '.md'] })],
	kit: {
		adapter: adapter(),
		typescript: {
			config: (config) => {
				config.include.push('../drizzle.config.ts');
			}
		},
		alias: {
			'@/*': './path/to/lib/*'
		}
	}
};
