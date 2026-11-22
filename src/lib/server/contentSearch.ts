/**
 * The app's wiring of photograph content search (see #lib/server/imageEmbeddings):
 * the Workers AI credentials from the environment, the app's database client,
 * and the bucket the display copies are read back from.
 *
 * Optional throughout. Without CLOUDFLARE_AI_TOKEN (local dev, tests, a
 * deployment that hasn't been given one) nothing is embedded and a content
 * search finds nothing, so /images searches by its sets' words alone, as it
 * always did. Nothing here throws on that account.
 */
import { waitUntil } from '@vercel/functions';
import * as env from '$app/env/private';
import { client } from './db';
import {
	embedImage,
	embedPending,
	embedQuery,
	scoreImages,
	selectMatches,
	storeEmbedding,
	type CatchUp,
	type EmbeddingConfig,
	type Scored
} from './imageEmbeddings';

/** Workers AI's account and token, or null when content search isn't set up. */
export function embeddingConfig(): EmbeddingConfig | null {
	const token = env.CLOUDFLARE_AI_TOKEN;
	const accountId = env.CLOUDFLARE_ACCOUNT_ID || env.R2_ACCOUNT_ID;
	return token && accountId ? { accountId, token } : null;
}

/**
 * Embed a photograph just recorded by an upload's finalize step, from the
 * display copy the step has already read, without holding up its response:
 * Vercel keeps the function alive for the promise (`waitUntil`). A failure is
 * logged and left to the nightly catch-up, which embeds whatever was missed.
 */
export function embedInBackground(imageId: number, display: Uint8Array): void {
	const config = embeddingConfig();
	if (!config) return;
	waitUntil(
		embedImage(config, display)
			.then((vector) => storeEmbedding(client, imageId, vector))
			.catch((e) => console.error(`[content-search] embedding image ${imageId} failed`, e))
	);
}

/**
 * The nightly catch-up: embed every photograph in a set that has no vector,
 * or one from another model, for up to `budgetMs`, reading each display copy
 * through `read` (#lib/server/imageUploads `readDisplayCopy`, passed in rather
 * than imported, since that module calls `embedInBackground`). Null when
 * content search isn't set up, so the cron can report the step as not run.
 */
export async function embedMissing(
	budgetMs: number,
	read: (url: string) => Promise<Uint8Array | null>
): Promise<CatchUp | null> {
	const config = embeddingConfig();
	if (!config) return null;
	return embedPending({
		client,
		config,
		read,
		budgetMs,
		onEach: (image, outcome) => {
			if (outcome !== 'embedded') {
				console.error(`[content-search] embedding image ${image.id} failed`, outcome);
			}
		}
	});
}

/**
 * The photographs of vetted sets that show what `query` names, best first.
 * Empty when content search isn't set up.
 */
export async function searchByContent(query: string): Promise<Scored[]> {
	const config = embeddingConfig();
	if (!config) return [];
	return selectMatches(await scoreImages(client, await embedQuery(config, query)));
}
