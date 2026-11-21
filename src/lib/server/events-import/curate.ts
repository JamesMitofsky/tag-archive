/**
 * Step 2 of the events import: turn each saved event page into a catalogue
 * entry in the seed file's shape, and collect them in
 * temp/events-import/events.json for review before importing.
 *
 * Every entry's title and description are the page's own words, copied
 * verbatim (see `verbatimText`); Claude only decides hosts, series and the
 * review flag. The import refuses an entry whose title or description no
 * longer matches its saved page.
 *
 *   pnpm events:curate                 # Claude decides hosts/series/flags
 *   pnpm events:curate --no-llm        # no API calls; every entry flagged for review
 *   pnpm events:curate --force         # redo cached curations and overwrite events.json
 *   pnpm events:curate --handoff       # no API calls; write the prompt and pages to handoff/
 *   pnpm events:curate --decisions temp/events-import/decisions.json
 *                                      # build entries from the session's decisions
 *
 * Claude credentials resolve the usual way: ANTHROPIC_API_KEY, or a profile from
 * `ant auth login`. Without either, a Claude Code session can curate instead:
 * --handoff writes the exact system prompt and per-page inputs the API would
 * get, the session writes decisions.json (hosts, series and flags only, checked
 * by `decisionsFileSchema`), and --decisions turns them into entries through
 * the same `toEventSource` guards as an API run. Each curation is cached in curated/<slug>.json against a
 * hash of its input, so a re-run only pays for new or changed pages.
 *
 * events.json is yours to edit (hosts, series, flags): a re-run adds entries
 * for new pages but keeps the ones already there as you left them (unless
 * --force).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
	decisionsFileSchema,
	pageForCuration,
	seriesCatalog,
	toEventSource,
	uncuratedEventSource,
	type Curation
} from './curate-prompt';
import { eventSlug, type RawEvent } from './squarespace';
import { loadRawEvents } from './verbatim';
import {
	CURATED_DIR,
	EVENTS_FILE,
	HANDOFF_DIR,
	RAW_DIR,
	canonicalEvent,
	eventsFileSchema,
	hashInput,
	readJson,
	writeJson,
	type CuratedFile
} from './workspace';

const { values: args } = parseArgs({
	options: {
		'no-llm': { type: 'boolean', default: false },
		force: { type: 'boolean', default: false },
		handoff: { type: 'boolean', default: false },
		decisions: { type: 'string' },
		concurrency: { type: 'string', default: '4' }
	}
});

const MODEL = 'claude-opus-5-5';
const modes = [args['no-llm'], args.handoff, args.decisions !== undefined].filter(Boolean);
if (modes.length > 1) throw new Error('Pass at most one of --no-llm, --handoff and --decisions.');
type Mode = 'api' | 'no-llm' | 'handoff' | 'decisions';
const mode: Mode = args['no-llm']
	? 'no-llm'
	: args.handoff
		? 'handoff'
		: args.decisions !== undefined
			? 'decisions'
			: 'api';
const curatedBy = mode === 'api' ? MODEL : mode === 'decisions' ? 'claude-code' : 'no-llm';

// Pages → the fields code can read off them directly.
const { byUrl, unreadable } = loadRawEvents();
for (const { path, error } of unreadable) console.error(`Skipping unreadable ${path}: ${error}`);
const seedEvents = loadSeedData().events;
// Pages saved by `events:fetch --all` for events the archive already has are
// for events:restore; only pages new to the archive are curated.
const seedUrls = new Set(seedEvents.map((e) => e.url));
const raws: RawEvent[] = [...byUrl.values()].filter((r) => !seedUrls.has(r.url));
if (raws.length === 0) {
	throw new Error(
		`No saved pages for events missing from the seed in ${RAW_DIR}. Run pnpm events:fetch first.`
	);
}
if (raws.length < byUrl.size) {
	console.log(`${byUrl.size - raws.length} saved pages are already in the seed; skipping them.`);
}

const knownSeries = new Set(seriesCatalog(seedEvents).map((s) => s.name));
const system = buildSystemPrompt(seedEvents);

if (mode === 'handoff') {
	// Everything the API would be sent, for the session to curate from. The
	// prompt is byte-identical to an API run's, so both curate by the same rules.
	rmSync(HANDOFF_DIR, { recursive: true, force: true });
	mkdirSync(HANDOFF_DIR, { recursive: true });
	writeFileSync(join(HANDOFF_DIR, 'system.md'), system + '\n');
	writeFileSync(
		join(HANDOFF_DIR, 'pages.jsonl'),
		raws.map((r) => JSON.stringify({ url: r.url, page: pageForCuration(r) })).join('\n') + '\n'
	);
	writeFileSync(
		join(HANDOFF_DIR, 'README.md'),
		`Curate each line of pages.jsonl by the rules in system.md.\n\n` +
			`Write one JSON array to temp/events-import/decisions.json, one object per page:\n\n` +
			`  {"url": "<the line's url>", "hosts": [], "series": null, ` +
			`"mayHaveException": false, "possibleExceptionDescription": null}\n\n` +
			`No other keys: title and description come from the page, never from a decision.\n` +
			`Then run: pnpm events:curate --decisions temp/events-import/decisions.json\n`
	);
	console.log(`Wrote ${raws.length} pages and the system prompt to ${HANDOFF_DIR}.`);
	process.exit(0);
}

// The session's decisions, when it curated instead of the API.
const decisions = new Map<string, Curation>();
if (mode === 'decisions') {
	const parsed = decisionsFileSchema.safeParse(readJson(args.decisions!));
	if (!parsed.success) {
		throw new Error(`${args.decisions} is not a valid decisions file:\n${parsed.error.message}`);
	}
	for (const { url, ...curation } of parsed.data) {
		if (decisions.has(url)) throw new Error(`${args.decisions} decides ${url} twice.`);
		decisions.set(url, curation);
	}
	const rawUrls = new Set(raws.map((r) => r.url));
	for (const url of decisions.keys()) {
		if (!rawUrls.has(url)) console.warn(`Ignoring decision for ${url}: no new saved page.`);
	}
}

const client = mode === 'api' ? new Anthropic({ maxRetries: 4 }) : null;

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
	const decision = decisions.get(raw.url);
	const inputHash = hashInput({ raw, PROMPT_VERSION, curatedBy, system, decision });
	if (!args.force && existsSync(path)) {
		const cached = readJson<CuratedFile>(path);
		if (cached.inputHash === inputHash) {
			reused++;
			return cached.event;
		}
	}
	try {
		let event: EventSource;
		if (mode === 'api' || mode === 'decisions') {
			let curation: Curation;
			if (mode === 'api') curation = await curateWithClaude(raw);
			else if (decision) curation = decision;
			else throw new Error(`no decision for it in ${args.decisions}`);
			const result = toEventSource(raw, curation, knownSeries);
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
