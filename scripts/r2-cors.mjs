// Apply the production R2 bucket's CORS rule. Photographs upload from the
// browser straight to the bucket with presigned PUTs (`presignPut` in
// src/lib/server/scans.ts), because an original can be far larger than a
// Vercel function body (4.5 MB) carries. Those PUTs are cross-origin, so
// without this rule every photograph upload fails at its CORS preflight.
//
// Run it from a machine logged in to Cloudflare (`pnpm exec wrangler login`, or
// a CLOUDFLARE_API_TOKEN allowed to edit R2), naming the bucket and the origins
// the site is served from:
//
//   R2_BUCKET=<bucket> R2_CORS_ORIGINS=https://archive.ustreetcommunity.org \
//     pnpm storage:cors [--dry-run]
//
// --dry-run prints the rule as JSON and applies nothing.
//
// R2_CORS_ORIGINS is comma-separated; when unset, an exported ORIGIN (the
// site's own origin) stands in, unless it is .env's or a local address. R2
// matches origins exactly and has no wildcard subdomains, so a Vercel preview
// deployment (https://tag-archive-<hash>-<team>.vercel.app) can only upload
// once its own origin is listed. The Cloudflare account is
// CLOUDFLARE_ACCOUNT_ID, else R2_ACCOUNT_ID.
//
// Unlike the dev scripts, this reads only the shell's environment, never .env:
// that file configures the dev site (its ORIGIN is localhost or a tunnel, its
// R2_BUCKET the local store's), so nothing in it may decide which bucket
// production's rule goes to, or what it allows. Wrangler still loads .env for
// its own CLOUDFLARE_* settings.
//
// `wrangler r2 bucket cors set` replaces the bucket's whole CORS configuration,
// so the rule built here is the only one the bucket keeps: change it here, not
// in the dashboard. The local RustFS store gets a wide-open rule instead
// (scripts/init-bucket.mjs).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const TAG = '[storage:cors]';
const USAGE =
	'Usage: R2_BUCKET=<bucket> R2_CORS_ORIGINS=https://<site>[,https://<other>] ' +
	'pnpm storage:cors [--dry-run]';

// What the uploader's PUT needs (`putWithProgress` in src/lib/images/upload.ts).
// Content-Type is the one header it sets, and the presigned URL signs it;
// Content-Length is set by the browser itself, so no preflight asks for it.
const METHODS = ['PUT', 'GET'];
const HEADERS = ['content-type'];
const EXPOSE_HEADERS = ['ETag'];
const MAX_AGE_SECONDS = 3600;

const { R2_CORS_ORIGINS, ORIGIN, R2_BUCKET, R2_ACCOUNT_ID, S3_ENDPOINT } = process.env;

/** The repository root, whatever directory the script is run from. */
const root = fileURLToPath(new URL('..', import.meta.url));

/** Print `message` and stop, before anything has been changed. */
function fail(message) {
	console.error(`${TAG} ${message}`);
	process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	console.log(USAGE);
	process.exit(0);
}
const unknown = args.filter((arg) => arg !== '--dry-run');
if (unknown.length > 0) fail(`unknown argument: ${unknown.join(' ')}\n${USAGE}`);
const dryRun = args.includes('--dry-run');

// A blank R2_CORS_ORIGINS counts as unset, as an empty env var does elsewhere.
const source = R2_CORS_ORIGINS?.trim() ? 'R2_CORS_ORIGINS' : 'ORIGIN';
const raw = (source === 'R2_CORS_ORIGINS' ? R2_CORS_ORIGINS : ORIGIN) ?? '';
const origins = [
	...new Set(
		raw
			.split(',')
			.map((origin) => origin.trim())
			.filter(Boolean)
	)
];
if (origins.length === 0) {
	fail(`no origins: set R2_CORS_ORIGINS (or ORIGIN) to the site's origin(s).\n${USAGE}`);
}

/** Why `value` can't be listed as a CORS origin, or null when it can. */
function originProblem(value) {
	if (value === '*') return "allows every site; list the site's own origins instead";
	if (value.includes('*')) {
		return "R2 can't wildcard subdomains: list each origin in full, deploy previews included";
	}
	let url;
	try {
		url = new URL(value);
	} catch {
		return 'not an absolute URL';
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'not an http(s) URL';
	// A browser's Origin header is exactly `url.origin`: lowercase host, no
	// default port, no path, no trailing slash. Written any other way, the
	// origin may never match a real request.
	if (url.origin !== value) return `not a bare origin; did you mean ${url.origin}?`;
	return null;
}

const problems = origins.flatMap((origin) => {
	const problem = originProblem(origin);
	return problem ? [`  ${JSON.stringify(origin)}: ${problem}`] : [];
});
if (problems.length > 0) fail(`${source} has origins the rule can't take:\n${problems.join('\n')}`);

/** ORIGIN as the repository's .env sets it, if it does; null without one. */
function dotenvOrigin() {
	try {
		return parseEnv(readFileSync(path.join(root, '.env'), 'utf8')).ORIGIN ?? null;
	} catch {
		return null;
	}
}

// An exported ORIGIN may still be .env's (direnv, or `set -a; . .env`): the
// dev site's, localhost or a tunnel for testing on a phone (see README).
// Falling back to that, or to any local address, would replace the production
// rule with one no deployed page matches, and break every upload on the live
// site.
const LOOPBACK_HOST = /^(?:localhost|.+\.localhost|127(?:\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0)$/;
if (source === 'ORIGIN') {
	const why =
		ORIGIN === dotenvOrigin()
			? "the dev site's, from .env"
			: origins.some((origin) => LOOPBACK_HOST.test(new URL(origin).hostname))
				? 'a local address'
				: null;
	if (why) {
		fail(
			`ORIGIN is ${ORIGIN}, ${why}, not where the site is served. Set ` +
				`R2_CORS_ORIGINS to the site's public origin(s).\n${USAGE}`
		);
	}
}

// The shape `wrangler r2 bucket cors set --file` reads (wrangler 4,
// src/r2/cors.ts): a `rules` array whose entries nest origins, methods and
// headers under `allowed` (it refuses S3's `CORSRules` / `AllowedOrigins`
// format), sent as is to R2's PUT .../r2/buckets/<bucket>/cors.
const config = {
	rules: [
		{
			allowed: { origins, methods: METHODS, headers: HEADERS },
			exposeHeaders: EXPOSE_HEADERS,
			maxAgeSeconds: MAX_AGE_SECONDS
		}
	]
};
const json = `${JSON.stringify(config, null, 2)}\n`;

if (dryRun) {
	// Only the JSON on stdout, so it can be redirected to a file as is. The
	// script then ends by itself rather than by process.exit, which could cut
	// the JSON short where stdout is an asynchronous pipe (macOS).
	process.stdout.write(json);
	console.error(
		`${TAG} dry run: the rule for bucket ${R2_BUCKET ? `"${R2_BUCKET}"` : '(R2_BUCKET unset)'}, ` +
			`origins from ${source}. Nothing applied.`
	);
} else {
	apply();
}

/** Set the rule on R2_BUCKET through wrangler, then list it back. */
function apply() {
	if (!R2_BUCKET) fail(`R2_BUCKET is not set: name the production bucket.\n${USAGE}`);
	if (S3_ENDPOINT) {
		console.error(
			`${TAG} note: S3_ENDPOINT is set, but this configures the Cloudflare R2 bucket, ` +
				'not that store (scripts/init-bucket.mjs sets up a local one).'
		);
	}

	// The project's own wrangler (a devDependency), run by its bin script under
	// this same node, so neither a global install nor a shell shim is needed.
	let wranglerBin;
	try {
		const dir = path.join(root, 'node_modules', 'wrangler');
		const { bin } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
		wranglerBin = path.join(dir, typeof bin === 'string' ? bin : bin.wrangler);
	} catch {
		fail('wrangler is not installed: run pnpm install.');
	}

	// A login that sees several accounts makes wrangler ask which one (and fail
	// when it can't ask); the bucket's account is the one R2_ACCOUNT_ID names.
	const env = { ...process.env };
	if (!env.CLOUDFLARE_ACCOUNT_ID && R2_ACCOUNT_ID) env.CLOUDFLARE_ACCOUNT_ID = R2_ACCOUNT_ID;

	/** Run wrangler with the terminal attached (it may need to log in); its exit code. */
	const wrangler = (wranglerArgs) => {
		const result = spawnSync(process.execPath, [wranglerBin, ...wranglerArgs], {
			stdio: 'inherit',
			env,
			cwd: root
		});
		if (result.error) throw new Error(`could not run wrangler: ${result.error.message}`);
		// null when a signal ended it.
		return result.status ?? 1;
	};

	const dir = mkdtempSync(path.join(tmpdir(), 'r2-cors-'));
	try {
		const file = path.join(dir, 'cors.json');
		writeFileSync(file, json);
		console.error(
			`${TAG} setting the CORS rule of R2 bucket "${R2_BUCKET}" for ${origins.join(', ')}`
		);
		const set = wrangler(['r2', 'bucket', 'cors', 'set', R2_BUCKET, '--file', file, '--force']);
		if (set !== 0) {
			console.error(`${TAG} wrangler could not set the rule (exit ${set}); see its output above.`);
			process.exitCode = set;
		} else {
			// Read back what R2 now holds, rather than trusting what was sent.
			const list = wrangler(['r2', 'bucket', 'cors', 'list', R2_BUCKET]);
			if (list !== 0) {
				console.warn(`${TAG} the rule was set, but listing it back failed (exit ${list}).`);
			}
		}
	} catch (e) {
		console.error(`${TAG} ${e instanceof Error ? e.message : e}`);
		process.exitCode = 1;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
