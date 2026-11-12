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
 * By default the events land as proposed additions: they wait in the keeper
 * review queue (/keeper/settings/review/events) and reach the public site as an
 * admin approves each one — approving also refreshes the site's cached dataset.
 * --publish skips the queue: the events go public at once, and the script then
 * purges the site's `archive` cache tag itself, which needs NETLIFY_AUTH_TOKEN
 * (and NETLIFY_SITE_ID or NETLIFY_SITE_SLUG; the slug defaults to tag-archive).
 *
 * Options:
 *   --file <path>        entries to import (default temp/events-import/events.json)
 *   --apply              write; without it nothing is written
 *   --publish            skip the review queue (see above)
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
import { applyImport, planImport, type ImportEvent, type SkipReason } from './import-core';
import { DEFAULT_TIME_ZONE, formatDate } from './squarespace';
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

// Check the purge credentials before writing anything, so --publish can't
// leave events public behind a stale cached dataset.
const netlifyToken = process.env.NETLIFY_AUTH_TOKEN;
if (args.apply && args.publish && !netlifyToken) {
	throw new Error('--publish needs NETLIFY_AUTH_TOKEN to refresh the site cache afterwards.');
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
		'same-title-and-date': 'same title and date as an existing event',
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
		`\nThey would land ${args.publish ? 'PUBLISHED (public immediately)' : 'as proposed additions in the review queue'}` +
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
		if (summary.events > 0 && args.publish) {
			const { purgeCache } = await import('@netlify/functions');
			const siteID = process.env.NETLIFY_SITE_ID;
			try {
				await purgeCache(
					siteID
						? { tags: ['archive'], token: netlifyToken, siteID }
						: {
								tags: ['archive'],
								token: netlifyToken,
								siteSlug: process.env.NETLIFY_SITE_SLUG || 'tag-archive'
							}
				);
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
		} else if (summary.events > 0) {
			console.log('Approve them at /keeper/settings/review/events to publish.');
		}

		if (args['write-seed']) await writeSeed(events, today);
	}
} finally {
	client.close();
}

/**
 * Append the file's entries the seed doesn't have yet (matched by URL) to the
 * end of the seed's events, so local dev mirrors the live archive. Appended,
 * never inserted by date: seed-core numbers events by position, and existing
 * ids must not shift.
 */
async function writeSeed(entries: ImportEvent[], today: string) {
	const seed = loadSeedData();
	const seedUrls = new Set(seed.events.map((e) => e.url));
	const additions = entries
		.filter((e) => !seedUrls.has(e.url))
		.filter((e) => args['include-upcoming'] || e.date <= today)
		.filter((e, i, all) => all.findIndex((o) => o.url === e.url) === i)
		.map(canonicalEvent);
	seed.events.push(...additions);
	writeFileSync(SEED_PATH, await formatSeed(seed));
	console.log(`Appended ${additions.length} events to ${SEED_PATH}.`);
}
