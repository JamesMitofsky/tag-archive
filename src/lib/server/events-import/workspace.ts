/**
 * The on-disk workspace the events-import pipeline passes between its steps,
 * plus the seed-file helpers. Everything lives under `temp/events-import/`
 * (gitignored), so every step is resumable and its output reviewable:
 *
 *   raw/<slug>.json      fetch:  the full Squarespace JSON for one event page
 *   fetch-report.json    fetch:  what was fetched, skipped, or failed
 *   curated/<slug>.json  curate: one catalogue entry + the input it came from
 *   events.json          curate: every curated entry, sorted — review and edit
 *                                this before importing; re-running curate keeps
 *                                your edits
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { z } from 'zod';
import type { EventSource, SeedData } from '../db/seed-core';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

export const SEED_PATH = join(ROOT, 'src/lib/data/seed-data.json');
export const WORKSPACE = join(ROOT, 'temp/events-import');
export const RAW_DIR = join(WORKSPACE, 'raw');
export const CURATED_DIR = join(WORKSPACE, 'curated');
export const FETCH_REPORT = join(WORKSPACE, 'fetch-report.json');
export const EVENTS_FILE = join(WORKSPACE, 'events.json');

export function readJson<T = unknown>(path: string): T {
	return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

export function writeJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(value, null, '\t') + '\n');
}

/** Every `*.json` in a workspace directory (empty when it doesn't exist yet). */
export function listJson(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.sort()
		.map((f) => join(dir, f));
}

/** What `raw/<slug>.json` holds. `page` is the untouched Squarespace response. */
export type RawFile = { url: string; fetchedAt: string; page: unknown };

/** What `curated/<slug>.json` holds. `inputHash` decides whether it is stale. */
export type CuratedFile = {
	url: string;
	inputHash: string;
	curatedBy: string;
	curatedAt: string;
	event: EventSource;
};

/** Stable hash of whatever a curated entry was derived from. */
export const hashInput = (value: unknown) =>
	createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

/**
 * One catalogue entry, exactly the seed file's event shape. Validates
 * `events.json` before anything is imported, since it is meant to be hand-edited.
 */
export const eventSourceSchema = z
	.object({
		title: z.string().trim().min(1),
		series: z.string().trim().min(1).nullish(),
		date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
		time: z.string().nullable(),
		location: z.string().nullable(),
		description: z.string().nullable(),
		hosts: z.array(z.string().trim().min(1)),
		url: z.string().url().nullable(),
		mayHaveException: z.boolean().optional(),
		possibleExceptionDescription: z.string().optional()
	})
	.strict();

export const eventsFileSchema = z.array(eventSourceSchema);

/**
 * Put an entry's keys in the seed file's order and drop the optional ones it
 * doesn't use, so appended rows read like the existing ones.
 */
export function canonicalEvent(e: EventSource): EventSource {
	return {
		title: e.title,
		...(e.series ? { series: e.series } : {}),
		date: e.date,
		time: e.time,
		location: e.location,
		description: e.description,
		hosts: e.hosts,
		url: e.url,
		mayHaveException: e.mayHaveException ?? false,
		...(e.mayHaveException && e.possibleExceptionDescription
			? { possibleExceptionDescription: e.possibleExceptionDescription }
			: {})
	};
}

/**
 * Serialize the seed file the way it is stored: tab-indented, every non-ASCII
 * character as a `\uXXXX` escape (the original export was written that way),
 * then run through the repo's prettier config. Round-trips the current file
 * byte-for-byte, so appending events produces a diff of only the new rows.
 */
export async function formatSeed(data: SeedData): Promise<string> {
	const ascii = JSON.stringify(data, null, '\t').replace(
		/[\u007f-\uffff]/g,
		(c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
	);
	const options = (await prettier.resolveConfig(SEED_PATH)) ?? {};
	return prettier.format(ascii, { ...options, filepath: SEED_PATH });
}
