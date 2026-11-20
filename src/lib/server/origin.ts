import { VERCEL_ENV, VERCEL_URL, ORIGIN } from '$app/env/private';

/**
 * The origin the site is being served from, for what needs it absolute: the
 * auth library's base URL (whose origin check refuses sign-in from anywhere
 * else) and image links in emails.
 *
 * ORIGIN, except on a Vercel preview deployment: each one gets its own URL
 * (`/deploy`, see .github/workflows/deploy-command.yml), which no fixed setting
 * can name, so there it is the deployment's own (VERCEL_URL, which Vercel sets
 * on every deployment). That keeps keeper sign-in working on a preview, whatever
 * the Preview environment's ORIGIN holds.
 */
export function siteOrigin(): string | undefined {
	if (VERCEL_ENV === 'preview' && VERCEL_URL) return `https://${VERCEL_URL}`;
	return ORIGIN || undefined;
}
