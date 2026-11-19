// Copy an iCloud Shared Album into the archive: `pnpm images:icloud --album '<link>'`.
// A dry run unless --apply; every option is documented in
// src/lib/server/icloud/sync.ts.
//
// The copy drives the app's own upload and image-set code, which imports
// SvelteKit's `$env`, `$app` and `$lib` modules. Those only resolve inside
// Vite, so this boots a Vite server with no HTTP listener and loads the module
// through it, as scripts/seed-photographs.mjs does. Env comes from .env plus
// the shell, the shell winning: export the live settings to copy into the
// live archive.
import { createServer } from 'vite';

const server = await createServer({
	appType: 'custom',
	logLevel: 'warn',
	server: { middlewareMode: true, hmr: false, ws: false }
});
try {
	const { main } = await server.environments.ssr.runner.import('/src/lib/server/icloud/sync.ts');
	await main(process.argv.slice(2));
} catch (e) {
	console.error('[images:icloud]', e instanceof Error ? e.message : e);
	process.exitCode = 1;
} finally {
	await server.close();
}
