/**
 * Step 3 of the events import: add the reviewed entries in
 * temp/events-import/events.json to an archive database. Insert-only and
 * re-runnable (see import-core). A dry run by default: it prints the plan and
 * writes nothing until --apply.
 *
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… pnpm events:import
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… IMPORT_CONFIRM=1 \
 *     pnpm events:import --apply --as you@example.com
 *
 * Every entry's title and description must match its saved page in
 * temp/events-import/raw/ word for word; the import refuses the whole file
 * otherwise, so a paraphrased or edited description can't reach the archive.
 *
 * Every event is public as soon as it is in, approved or not. By default the
 * events land as proposed additions, which also puts them in the keeper review
 * queue (/keeper/settings/review/events) for an admin to check; --publish lands
 * them already approved. Writing to a remote database, the script then purges
 * the site's `archive` cache tag so the events show at once, which needs
 * VERCEL_TOKEN and the linked Vercel project (`vercel link`, or
 * VERCEL_PROJECT_ID and VERCEL_ORG_ID; see ./purge). A local database backs no
 * deployed site, so it skips the purge.
 *
 * Options:
 *   --file <path>        entries to import (default temp/events-import/events.json)
 *   --apply              write; without it nothing is written
 *   --publish            land the events approved, skipping the review queue
 *   --as <email>         attribute the rows to this keeper account
 *   --include-upcoming   also import events dated after today
 *   --write-seed         also append the entries to src/lib/data/seed-data.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { loadSeedData, type EventSource } from '../db/seed-core';
import { user } from '../db/schema';
import {
	applyImport,
	planImport,
	seedAdditions,
	type ImportEvent,
	type SkipReason
} from './import-core';
import { purgeArchiveCache, vercelProject } from './purge';
import { DEFAULT_TIME_ZONE, formatDate } from './squarespace';
import { loadRawEvents, verbatimMismatches } from './verbatim';
import { EVENTS_FILE, SEED_PATH, canonicalEvent, eventsFileSchema, formatSeed } from './workspace';

const { values: args } = parseArgs({
	options: {
		file: { type: 'string', default: EVENTS_FILE },
		apply: { type: 'boolean', default: false },
		publish: { type: 'boolean', default: false },
		as: { type: 'string' },
		'include-upcoming': { type: 'boolean', default: false },
		'write-seed': { type: 'boolean', default: false }
	}
});

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const isRemote = url.startsWith('libsql://') || url.startsWith('https://');
if (args.apply && isRemote && process.env.IMPORT_CONFIRM !== '1') {
	throw new Error(
		`Refusing to write to remote database ${url} without IMPORT_CONFIRM=1. ` +
			`Dry-run first (drop --apply), then re-run with IMPORT_CONFIRM=1.`
	);
}

// Check the purge credentials before writing anything, so an import can't
// leave new events hidden behind a stale cached dataset.
const vercelToken = process.env.VERCEL_TOKEN;
if (args.apply && isRemote) {
	if (!vercelToken) {
		throw new Error(
			'Importing to a remote database needs VERCEL_TOKEN to refresh the site cache afterwards.'
		);
	}
	vercelProject();
}

const parsed = eventsFileSchema.safeParse(JSON.parse(readFileSync(args.file, 'utf-8')));
if (!parsed.success) {
	throw new Error(`${args.file} is not a valid events file:\n${parsed.error.message}`);
}
const missingUrl = parsed.data.filter((e) => !e.url);
if (missingUrl.length) {
	throw new Error(
		`Every entry needs a url (it is how re-runs recognize imported events). Missing on: ` +
			missingUrl.map((e) => `${e.date} ${e.title}`).join('; ')
	);
}
const events = parsed.data as ImportEvent[];

// Titles and descriptions are the source pages' own words; refuse anything else.
const mismatches = verbatimMismatches(events, loadRawEvents().byUrl);
if (mismatches.length) {
	const show = (text: string | null | undefined) => JSON.stringify(text ?? null);
	const lines = mismatches.map((m) => {
		const at = `${m.date} ${m.title} (${m.url})`;
		if (m.problem === 'no-saved-page') return `  ${at}: no saved page to check it against`;
		const field = m.problem === 'title-differs' ? 'title' : 'description';
		return `  ${at}: ${field} differs from the page\n    page: ${show(m.expected)}\n    file: ${show(m.actual)}`;
	});
	throw new Error(
		`${mismatches.length} entr${mismatches.length === 1 ? 'y does' : 'ies do'} not keep the ` +
			`page's own title and description:\n${lines.join('\n')}\n\n` +
			`Titles and descriptions are copied from the page verbatim. Re-run ` +
			`pnpm events:curate (after pnpm events:fetch for missing pages) instead of editing them.`
	);
}

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const db = drizzle(client);

try {
	let actorId: string | null = null;
	if (args.as) {
		const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, args.as));
		if (!row) throw new Error(`No user with email ${args.as} in ${url}`);
		actorId = row.id;
	}

	const today = formatDate(Date.now(), DEFAULT_TIME_ZONE);
	const plan = await planImport(db, events, {
		today,
		includeUpcoming: args['include-upcoming']
	});

	const line = (e: EventSource, extra = '') =>
		`  ${e.date}  ${e.title}${e.hosts.length ? `  [${e.hosts.join(', ')}]` : ''}${extra}`;
	console.log(`Target: ${url}`);
	console.log(`${events.length} entries in ${args.file}\n`);
	console.log(`Would add ${plan.insert.length} events:`);
	for (const e of plan.insert) {
		const banner = plan.seriesByUrl.get(e.url);
		const flag = e.mayHaveException ? `  ! ${e.possibleExceptionDescription ?? 'flagged'}` : '';
		console.log(line(e, `${banner ? `  (series: ${banner})` : ''}${flag}`));
	}
	const reasons: Record<SkipReason, string> = {
		'already-imported': 'already in the database (same URL)',
		'same-title-and-date':
			'same title (ignoring case and punctuation) and date as an existing event',
		upcoming: `dated after today (${today}); pass --include-upcoming to add`,
		'repeated-in-file': 'URL repeated in the file'
	};
	for (const reason of Object.keys(reasons) as SkipReason[]) {
		const group = plan.skipped.filter((s) => s.reason === reason);
		if (group.length === 0) continue;
		console.log(`\nSkipping ${group.length} — ${reasons[reason]}:`);
		for (const s of group) console.log(line(s.event));
	}
	if (plan.newSeries.length) {
		console.log(`\nWould create ${plan.newSeries.length} series: ${plan.newSeries.join(', ')}`);
	}
	if (plan.newPeople.length) {
		console.log(`\nWould create ${plan.newPeople.length} people: ${plan.newPeople.join(', ')}`);
	}
	console.log(
		`\nThey would land public, ${args.publish ? 'already approved' : 'as proposed additions in the review queue'}` +
			`${actorId ? `, attributed to ${args.as}` : ', unattributed'}.`
	);

	if (!args.apply) {
		console.log('\nDry run: nothing written. Re-run with --apply to import.');
	} else {
		const summary = await applyImport(db, plan, { proposed: !args.publish, actorId });
		console.log(
			`\nImported ${summary.events} events, ${summary.series} new series, ` +
				`${summary.people} new people, ${summary.hostLinks} host links.`
		);
		if (summary.events > 0 && isRemote) {
			try {
				await purgeArchiveCache(vercelToken!);
				console.log('Purged the site cache; the events are live now.');
			} catch (err) {
				// The events are already in; only the cached public dataset is stale.
				console.error(
					`The events are imported and public, but purging the site cache failed ` +
						`(${err instanceof Error ? err.message : err}). The cached dataset expires ` +
						`within a day, and any keeper edit purges it sooner.`
				);
				process.exitCode = 1;
			}
		}
		if (summary.events > 0 && !args.publish) {
			console.log('Check and approve them at /keeper/settings/review/events.');
		}

		if (args['write-seed']) await writeSeed(events, today);
	}
} finally {
	client.close();
}

/**
 * Append the file's entries the seed doesn't have yet to the end of the seed's
 * events, so local dev mirrors the live archive. `seedAdditions` applies the
 * import's own skip rules (URL, then title and date), so an event the database
 * already holds under another URL isn't added to the seed twice. Appended,
 * never inserted by date: seed-core numbers events by position, and existing
 * ids must not shift.
 */
async function writeSeed(entries: ImportEvent[], today: string) {
	const seed = loadSeedData();
	const additions = seedAdditions(seed.events, entries, {
		today,
		includeUpcoming: args['include-upcoming']
	}).map(canonicalEvent);
	seed.events.push(...additions);
	writeFileSync(SEED_PATH, await formatSeed(seed));
	console.log(`Appended ${additions.length} events to ${SEED_PATH}.`);
}
