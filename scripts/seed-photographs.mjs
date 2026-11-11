// Seed the local dev archive with demo image sets — the photograph counterpart
// to seed-images.mjs (scans). Runs at dev boot, after init-bucket, once RustFS
// and the DB are up; re-run by hand with `pnpm db:seed:photographs`.
//
// The seeding itself (src/lib/server/db/seed-photographs.ts) drives the app's
// own upload and image-set code, which imports SvelteKit's `$env`, `$app` and
// `$lib` modules. Those only resolve inside Vite, so this boots a Vite server
// with no HTTP listener and loads the module through it — the same way
// `vite dev` loads server code. Env comes from .env plus whatever the run
// script exported (S3_ENDPOINT, R2_PUBLIC_URL, DATABASE_URL), the latter winning.
//
// Local-only, checked here before anything boots and again in the module:
// no S3_ENDPOINT means remote R2; a libsql:// or https:// DATABASE_URL means
// remote Turso. Either way, nothing is touched.
import { createServer } from 'vite';

const { S3_ENDPOINT, DATABASE_URL = '' } = process.env;
if (!S3_ENDPOINT) {
	console.log('[seed-photographs] no S3_ENDPOINT — assuming remote R2, skipping.');
	process.exit(0);
}
if (DATABASE_URL.startsWith('libsql://') || DATABASE_URL.startsWith('https://')) {
	console.error(`[seed-photographs] refusing a remote database (${DATABASE_URL}). Local-only.`);
	process.exit(1);
}

const server = await createServer({
	appType: 'custom',
	logLevel: 'warn',
	server: { middlewareMode: true, hmr: false, ws: false }
});
try {
	const { seedPhotographs } = await server.environments.ssr.runner.import(
		'/src/lib/server/db/seed-photographs.ts'
	);
	await seedPhotographs();
} catch (e) {
	console.error('[seed-photographs] failed:', e instanceof Error ? e.message : e);
	process.exitCode = 1;
} finally {
	await server.close();
}
