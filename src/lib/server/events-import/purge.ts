/**
 * Refresh the public site's cached archive dataset after a script writes
 * public events straight to the database (keeper edits do this themselves,
 * through #lib/server/cache).
 *
 * The app drops the `archive` cache tag from inside a Vercel function with
 * `dangerouslyDeleteByTag`. A script on a laptop has no such context, so it
 * makes the same call through Vercel's REST API. Deleted rather than
 * invalidated, as in the app: an invalidated entry is served stale once more,
 * so the first visitor after the write would still see the old archive.
 *
 * No `target`: production and previews read the same database, so the tag is
 * dropped in both.
 *
 * Needs a Vercel access token with access to the project's team (VERCEL_TOKEN).
 * The project and team are VERCEL_PROJECT_ID and VERCEL_ORG_ID when set (the
 * Vercel CLI's own names), else read from .vercel/project.json, which
 * `vercel link` writes.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readJson } from './workspace';

const ARCHIVE_TAG = 'archive';

/**
 * The linked Vercel project and its team. Throws when neither the environment
 * nor `vercel link` names them, so callers can check before writing anything.
 */
export function vercelProject(): { projectId: string; teamId: string } {
	let projectId = process.env.VERCEL_PROJECT_ID;
	let teamId = process.env.VERCEL_ORG_ID;
	const linkFile = join(ROOT, '.vercel/project.json');
	if ((!projectId || !teamId) && existsSync(linkFile)) {
		const link = readJson<{ projectId?: string; orgId?: string }>(linkFile);
		projectId ||= link.projectId;
		teamId ||= link.orgId;
	}
	if (!projectId || !teamId) {
		throw new Error(
			'Refreshing the site cache needs the Vercel project: run `vercel link` in the repo, ' +
				'or set VERCEL_PROJECT_ID and VERCEL_ORG_ID.'
		);
	}
	return { projectId, teamId };
}

export async function purgeArchiveCache(token: string): Promise<void> {
	const { projectId, teamId } = vercelProject();
	const url = new URL('https://api.vercel.com/v1/edge-cache/dangerously-delete-by-tags');
	url.searchParams.set('projectIdOrName', projectId);
	url.searchParams.set('teamId', teamId);
	const res = await fetch(url, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ tags: [ARCHIVE_TAG] })
	});
	if (!res.ok) {
		throw new Error(`Vercel answered ${res.status}: ${(await res.text()).slice(0, 500)}`);
	}
}
