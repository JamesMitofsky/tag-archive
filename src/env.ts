import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * A variable that may be unset: its value as given, `undefined` when it is
 * missing. This is what `$env/dynamic/private` returned before SvelteKit 3, and
 * the code reads each of these with a fallback or a check of its own (see
 * `.env.example` for what each one is for).
 */
const optional = { schema: (value: string | undefined) => value };

// Every variable but the one marked public is private (server-only), and all
// are read from the environment when the app starts (`static` defaults to
// false), so secrets set in Vercel's settings reach the functions without being
// inlined into the build.
export const variables = defineEnvVars({
	DATABASE_URL: optional,
	DATABASE_AUTH_TOKEN: optional,
	ORIGIN: optional,
	BETTER_AUTH_SECRET: optional,
	CRON_SECRET: optional,
	RESEND_API_KEY: optional,
	RESEND_FROM: optional,
	NFC_SDM_META_KEY: optional,
	NFC_SDM_FILE_KEY: optional,
	VERCEL_ENV: optional,
	VERCEL_URL: optional,
	// Scan storage (src/lib/server/scans.ts).
	R2_ACCOUNT_ID: optional,
	R2_ACCESS_KEY_ID: optional,
	R2_SECRET_ACCESS_KEY: optional,
	R2_BUCKET: optional,
	R2_PUBLIC_URL: optional,
	S3_ENDPOINT: optional,
	S3_REGION: optional,
	S3_UPLOAD_PROXY: optional,
	// The Archive Stream relay (relay/), e.g. `wss://archive-stream-relay.<you>.workers.dev`.
	// Public: the installation's pages read it in the browser. Only an address,
	// never a secret; the relay's key travels in the pages' own URL instead.
	PUBLIC_INSTALLATION_RELAY_URL: { ...optional, public: true }
});
