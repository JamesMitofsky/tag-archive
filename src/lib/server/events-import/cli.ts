/**
 * The database side of `events:restore`: the saved pages it checks against,
 * the baseline seed that tells untouched imports from keeper edits, and a
 * guarded connection to an archive database.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import type { SeedData } from '../db/seed-core';
import { user } from '../db/schema';
import { purgeArchiveCache } from './purge';
import type { PageMoved } from './restore-core';
import type { RawEvent } from './squarespace';
import { loadRawEvents } from './verbatim';
import { FETCH_REPORT, ROOT, readJson } from './workspace';

/**
 * The last commit whose seed file still holds the text the archive was first
 * imported with — paraphrased descriptions included. --db modes compare
 * database rows against it to tell untouched imports from keeper edits.
 */
export const BASELINE_REV = '861cacf2bf4d7d4357053ff653f4c456d61344c1';

/** The seed at `rev`, read from git, as the baseline of what was first imported. */
export function baselineSeed(rev: string): SeedData {
	const json = execFileSync('git', ['show', `${rev}:src/lib/data/seed-data.json`], {
		cwd: ROOT,
		encoding: 'utf-8',
		maxBuffer: 256 * 1024 * 1024
	});
	return JSON.parse(json) as SeedData;
}

/** Every saved page, warning when the last fetch left gaps. */
export function loadSavedPages(): Map<string, RawEvent> {
	const { byUrl, unreadable } = loadRawEvents();
	for (const { path, error } of unreadable) console.error(`Skipping unreadable ${path}: ${error}`);
	if (byUrl.size === 0) throw new Error('No saved pages. Run pnpm events:fetch --all first.');
	if (existsSync(FETCH_REPORT)) {
		const report = readJson<{ all?: boolean; failed?: unknown[] }>(FETCH_REPORT);
		if (!report.all) {
			console.warn('The last fetch ran without --all, so most archived events have no saved page.');
		}
		if (report.failed?.length) {
			console.warn(
				`${report.failed.length} pages failed to fetch last run; those events are left as they ` +
					`are. Re-run pnpm events:fetch --all to retry them.`
			);
		}
	}
	return byUrl;
}

export const show = (text: string | null) => JSON.stringify(text);

/** One line per event whose page is now dated differently, with likely real pages. */
export function printMoved(list: PageMoved[]) {
	for (const m of list) {
		console.log(
			`  ${m.archived.date} ${show(m.archived.title)} → page dated ${m.page.date} ${show(m.page.title)}\n    ${m.url}`
		);
		for (const p of m.sameDatePages) console.log(`    same-date page: ${show(p.title)} ${p.url}`);
	}
}

/**
 * Connect to DATABASE_URL with the same guards as events:import: writing to a
 * remote database needs IMPORT_CONFIRM=1, and (unless `purge` is off) the
 * NETLIFY_AUTH_TOKEN the site cache refresh needs, checked before anything is
 * written. `--as` resolves to the keeper the writes are attributed to.
 */
export async function openArchiveDb(options: { apply: boolean; purge: boolean; as?: string }) {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is not set');
	const isRemote = url.startsWith('libsql://') || url.startsWith('https://');
	if (options.apply && isRemote && process.env.IMPORT_CONFIRM !== '1') {
		throw new Error(
			`Refusing to write to remote database ${url} without IMPORT_CONFIRM=1. ` +
				`Dry-run first (drop --apply), then re-run with IMPORT_CONFIRM=1.`
		);
	}
	const netlifyToken = process.env.NETLIFY_AUTH_TOKEN;
	const purge = isRemote && options.purge;
	if (options.apply && purge && !netlifyToken) {
		throw new Error(
			'Writing to a live database needs NETLIFY_AUTH_TOKEN to refresh the site cache ' +
				'afterwards (or --no-purge to let it expire on its own within a day).'
		);
	}

	const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
	const db = drizzle(client);
	let actorId: string | null = null;
	if (options.as) {
		const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, options.as));
		if (!row) {
			client.close();
			throw new Error(`No user with email ${options.as} in ${url}`);
		}
		actorId = row.id;
	}

	/** Refresh the public dataset after a write; a failure only leaves it stale. */
	async function refreshSite(what: string) {
		if (!purge) return;
		try {
			await purgeArchiveCache(netlifyToken!);
			console.log(`Purged the site cache; ${what} live now.`);
		} catch (err) {
			console.error(
				`Written, but purging the site cache failed (${err instanceof Error ? err.message : err}). ` +
					`The cached dataset expires within a day, and any keeper edit purges it sooner.`
			);
			process.exitCode = 1;
		}
	}

	return { url, db, actorId, refreshSite, close: () => client.close() };
}
