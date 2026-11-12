/**
 * Step 2 of the events import: turn each saved event page into a catalogue
 * entry in the seed file's shape, and collect them in
 * temp/events-import/events.json for review before importing.
 *
 *   pnpm events:curate                 # Claude writes description/hosts/series/flags
 *   pnpm events:curate --no-llm        # no API calls; every entry flagged for review
 *   pnpm events:curate --force         # redo cached curations and overwrite events.json
 *
 * Claude credentials resolve the usual way: ANTHROPIC_API_KEY, or a profile from
 * `ant auth login`. Each curation is cached in curated/<slug>.json against a
 * hash of its input, so a re-run only pays for new or changed pages.
 *
 * events.json is yours to edit: a re-run adds entries for new pages but keeps
 * the ones already there as you left them (unless --force).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { loadSeedData, type EventSource } from '../db/seed-core';
import {
	PROMPT_VERSION,
	buildSystemPrompt,
	buildUserMessage,
	curationSchema,
	seriesCatalog,
	toEventSource,
	uncuratedEventSource
} from './curate-prompt';
import { eventSlug, parseEventPage, toRawEvent, type RawEvent } from './squarespace';
import {
	CURATED_DIR,
	EVENTS_FILE,
	RAW_DIR,
	canonicalEvent,
	eventsFileSchema,
	hashInput,
	listJson,
	readJson,
	writeJson,
	type CuratedFile,
	type RawFile
} from './workspace';

const { values: args } = parseArgs({
	options: {
		'no-llm': { type: 'boolean', default: false },
		force: { type: 'boolean', default: false },
		concurrency: { type: 'string', default: '4' }
	}
});

const MODEL = 'claude-opus-5-5';
const useClaude = !args['no-llm'];
const curatedBy = useClaude ? MODEL : 'no-llm';

// Pages → the fields code can read off them directly.
const raws: RawEvent[] = [];
for (const path of listJson(RAW_DIR)) {
	const file = readJson<RawFile>(path);
	try {
		const { item, timeZone } = parseEventPage(file.page);
		raws.push(toRawEvent(file.url, item, timeZone));
	} catch (err) {
		console.error(`Skipping unreadable ${path}: ${err instanceof Error ? err.message : err}`);
	}
}
if (raws.length === 0)
	throw new Error(`No saved pages in ${RAW_DIR}. Run pnpm events:fetch first.`);

const seedEvents = loadSeedData().events;
const knownSeries = new Set(seriesCatalog(seedEvents).map((s) => s.name));
const system = buildSystemPrompt(seedEvents);

const client = useClaude ? new Anthropic({ maxRetries: 4 }) : null;

async function curateWithClaude(raw: RawEvent) {
	const response = await client!.beta.messages.parse({
		model: MODEL,
		max_tokens: 16000,
		// On a safety decline, let the API re-run the request on a fallback model.
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
		// Same bytes for every event, so all but the first call read it from cache.
		system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
		messages: [{ role: 'user', content: buildUserMessage(raw) }],
		output_config: { effort: 'medium', format: betaZodOutputFormat(curationSchema) }
	});
	if (response.stop_reason === 'refusal') {
		throw new Error(`declined: ${response.stop_details?.explanation ?? 'no explanation'}`);
	}
	if (response.stop_reason === 'max_tokens') throw new Error('hit max_tokens');
	if (!response.parsed_output) throw new Error('response did not match the schema');
	return response.parsed_output;
}

let reused = 0;
let curated = 0;
const failed: { url: string; error: string }[] = [];

async function curateOne(raw: RawEvent): Promise<EventSource | null> {
	const path = join(CURATED_DIR, `${eventSlug(raw.url)}.json`);
	const inputHash = hashInput({ raw, PROMPT_VERSION, curatedBy, system });
	if (!args.force && existsSync(path)) {
		const cached = readJson<CuratedFile>(path);
		if (cached.inputHash === inputHash) {
			reused++;
			return cached.event;
		}
	}
	try {
		let event: EventSource;
		if (useClaude) {
			const result = toEventSource(raw, await curateWithClaude(raw), knownSeries);
			for (const w of result.warnings) console.warn(`  ${raw.title} (${raw.date}): ${w}`);
			event = result.event;
		} else {
			event = uncuratedEventSource(raw, knownSeries);
		}
		writeJson(path, {
			url: raw.url,
			inputHash,
			curatedBy,
			curatedAt: new Date().toISOString(),
			event
		} satisfies CuratedFile);
		curated++;
		console.log(`curated ${raw.date} ${raw.title}`);
		return event;
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		failed.push({ url: raw.url, error });
		console.error(`FAILED ${raw.url}: ${error}`);
		return null;
	}
}

// A small worker pool: a few requests in flight, never the whole batch at once.
const results: (EventSource | null)[] = new Array(raws.length);
let next = 0;
await Promise.all(
	Array.from({ length: Math.max(1, Number(args.concurrency)) }, async () => {
		while (next < raws.length) {
			const i = next++;
			results[i] = await curateOne(raws[i]);
		}
	})
);
const fresh = results.filter((e): e is EventSource => e !== null).map(canonicalEvent);

// Merge into events.json, keeping hand edits to entries already there.
const previous =
	!args.force && existsSync(EVENTS_FILE) ? eventsFileSchema.parse(readJson(EVENTS_FILE)) : [];
const previousUrls = new Set(previous.map((e) => e.url));
const added = fresh.filter((e) => !previousUrls.has(e.url));
const kept = new Map(fresh.map((e) => [e.url, e]));
const edited = previous.filter(
	(e) => kept.has(e.url) && JSON.stringify(e) !== JSON.stringify(kept.get(e.url))
);
const merged = [...previous, ...added].sort(
	(a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
);
writeJson(EVENTS_FILE, merged);

console.log(
	`\n${curated} curated, ${reused} reused from cache, ${failed.length} failed. ` +
		`events.json: ${merged.length} entries (${added.length} new).`
);
if (edited.length) {
	console.log(
		`${edited.length} entries in events.json differ from their latest curation; kept your ` +
			`version (re-run with --force to replace them).`
	);
}
console.log(
	`\nReview ${EVENTS_FILE}, then dry-run the import:\n` +
		`  DATABASE_URL=... DATABASE_AUTH_TOKEN=... pnpm events:import`
);
if (failed.length) process.exitCode = 1;
