/**
 * Put back archived events' original titles and descriptions, word for word
 * from their pages on ustreetcommunity.org, where the archive holds a
 * paraphrase. The rules are in restore-core; this does the I/O. A dry run by
 * default: it prints the plan, writes the full before/after to
 * temp/events-import/restore-report.json, and changes nothing until --apply.
 *
 * First save every event's page (read-only against the site):
 *
 *   pnpm events:fetch --all
 *
 * Then the seed file, which local dev seeds from:
 *
 *   pnpm events:restore --seed            # dry run
 *   pnpm events:restore --seed --apply    # rewrite src/lib/data/seed-data.json
 *
 * And a live database (production keeps its own data, edited by keepers):
 *
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… pnpm events:restore --db
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… IMPORT_CONFIRM=1 NETLIFY_AUTH_TOKEN=… \
 *     pnpm events:restore --db --apply --as you@example.com
 *
 * In --db mode a field is restored only while it still holds what the
 * original import wrote, read from the seed file at --baseline (a git
 * revision from before the seed itself was restored). A keeper's edits are
 * never overwritten; they are listed for review instead. Every update also
 * re-checks the row it expects, inside one transaction, so a keeper saving
 * mid-run is never clobbered either.
 *
 * Options:
 *   --seed | --db      which archive to restore (exactly one)
 *   --apply            write; without it nothing is written
 *   --as <email>       --db: attribute the updates to this keeper account
 *   --baseline <rev>   --db: git revision of the seed the database was imported
 *                      from (default BASELINE_REV)
 *   --no-purge         --db: skip refreshing the site's cached dataset
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { and, eq, isNull } from 'drizzle-orm';
import { loadSeedData } from '../db/seed-core';
import { event } from '../db/schema';
import { BASELINE_REV, baselineSeed, loadSavedPages, openArchiveDb, printMoved, show } from './cli';
import { planDbRestore, planSeedRestore, type PageMoved, type TextChange } from './restore-core';
import type { VerbatimText } from './verbatim';
import { SEED_PATH, WORKSPACE, formatSeed, writeJson } from './workspace';

const REPORT = join(WORKSPACE, 'restore-report.json');

const { values: args } = parseArgs({
	options: {
		seed: { type: 'boolean', default: false },
		db: { type: 'boolean', default: false },
		apply: { type: 'boolean', default: false },
		as: { type: 'string' },
		baseline: { type: 'string', default: BASELINE_REV },
		'no-purge': { type: 'boolean', default: false }
	}
});
if (args.seed === args.db) throw new Error('Pass exactly one of --seed or --db.');

const rawByUrl = loadSavedPages();

function printChanges(changes: TextChange[], limit = 5) {
	for (const c of changes.slice(0, limit)) {
		console.log(`\n  ${c.date}  ${c.url}`);
		if (c.before.title !== c.after.title) {
			console.log(`    title  was ${show(c.before.title)}\n           now ${show(c.after.title)}`);
		}
		if (c.before.description !== c.after.description) {
			console.log(
				`    description was ${show(c.before.description)}\n                now ${show(c.after.description)}`
			);
		}
	}
	if (changes.length > limit) console.log(`\n  … and ${changes.length - limit} more in ${REPORT}`);
}

/** Events whose page is now dated differently: their text is never copied across. */
function reportMoved(list: PageMoved[]) {
	if (list.length === 0) return;
	console.log(
		`${list.length} events link to a page that is now dated differently, so it may describe ` +
			`another event. Nothing is copied from it; their AI-written summary is cleared:`
	);
	printMoved(list);
}

if (args.seed) await restoreSeed();
else await restoreDb();

async function restoreSeed() {
	const plan = planSeedRestore(loadSeedData(), rawByUrl, baselineTexts());
	const restored = plan.changes.filter((c) => c.kind === 'restored');
	const titles = restored.filter((c) => c.before.title !== c.after.title).length;
	const descriptions = restored.filter((c) => c.before.description !== c.after.description).length;
	const cleared = plan.changes.length - restored.length;
	writeJson(REPORT, {
		target: SEED_PATH,
		ranAt: new Date().toISOString(),
		changes: plan.changes,
		pinnedSeries: plan.pinnedSeries,
		relinkedArtefacts: plan.relinkedArtefacts,
		pageMoved: plan.pageMoved,
		noPage: plan.noPage.map((e) => ({ date: e.date, title: e.title, url: e.url }))
	});

	console.log(`Target: ${SEED_PATH}`);
	console.log(
		`${restored.length} events to restore (${titles} titles, ${descriptions} descriptions); ` +
			`${cleared} AI-written summaries to clear on events with no usable page; ` +
			`${plan.alreadyVerbatim} already match their page; ${plan.noPage.length} have no saved ` +
			`page (gone from the site or not fetched) and stay as they are; ${plan.noUrl} have no URL.`
	);
	reportMoved(plan.pageMoved);
	if (plan.pinnedSeries.length) {
		console.log(
			`${plan.pinnedSeries.length} retitled events get an explicit "series" so they keep their banner.`
		);
	}
	if (plan.relinkedArtefacts.length) {
		console.log(
			`${plan.relinkedArtefacts.length} artefacts get their event's restored title so they stay linked.`
		);
	}
	printChanges(plan.changes);
	console.log(`\nFull report: ${REPORT}`);

	if (!args.apply) {
		console.log('\nDry run: nothing written. Re-run with --apply to rewrite the seed.');
		return;
	}
	writeFileSync(SEED_PATH, await formatSeed(plan.data));
	console.log(`\nRewrote ${SEED_PATH}. Run pnpm db:seed to load it locally.`);
}

/** Title and description per URL in the baseline seed: what the original import wrote. */
function baselineTexts(): Map<string, VerbatimText> {
	const byUrl = new Map<string, VerbatimText>();
	for (const e of baselineSeed(args.baseline).events) {
		if (e.url) byUrl.set(e.url, { title: e.title, description: e.description });
	}
	return byUrl;
}

async function restoreDb() {
	const baselineByUrl = baselineTexts();

	const { url, db, actorId, refreshSite, close } = await openArchiveDb({
		apply: args.apply,
		purge: !args['no-purge'],
		as: args.as
	});
	try {
		const rows = await db
			.select({
				id: event.id,
				url: event.url,
				date: event.date,
				title: event.title,
				description: event.description
			})
			.from(event);
		const plan = planDbRestore(rows, baselineByUrl, rawByUrl);
		writeJson(REPORT, {
			target: url,
			baseline: args.baseline,
			ranAt: new Date().toISOString(),
			update: plan.update,
			keeperEdited: plan.keeperEdited,
			noBaseline: plan.noBaseline,
			pageMoved: plan.pageMoved,
			noPage: plan.noPage
		});

		console.log(`Target: ${url}`);
		const cleared = plan.update.filter((u) => u.kind === 'cleared').length;
		console.log(
			`${rows.length} events. ${plan.update.length - cleared} to restore and ${cleared} ` +
				`AI-written summaries to clear (no usable page); ${plan.alreadyVerbatim} already ` +
				`match their page; ${plan.noPage.length} have no saved page; ${plan.noUrl} have no URL.`
		);
		if (plan.keeperEdited.length) {
			console.log(
				`${plan.keeperEdited.length} fields were edited by a keeper since the import and are left ` +
					`alone (listed under keeperEdited in the report).`
			);
		}
		reportMoved(plan.pageMoved);
		if (plan.noBaseline.length) {
			console.log(
				`${plan.noBaseline.length} events differ from their page but aren't in the baseline seed, ` +
					`so they are left alone (listed under noBaseline in the report).`
			);
		}
		printChanges(plan.update);
		console.log(`\nFull report: ${REPORT}`);

		if (!args.apply) {
			console.log('\nDry run: nothing written. Re-run with --apply to restore.');
			return;
		}
		if (plan.update.length === 0) {
			console.log('\nNothing to restore.');
			return;
		}

		// Each update matches the exact text it planned against, so a row a keeper
		// saved since the dry run is skipped, not overwritten. One batch = one
		// transaction: either every restore lands or none does.
		const statements = plan.update.map((u) =>
			db
				.update(event)
				.set({ title: u.after.title, description: u.after.description, updatedBy: actorId })
				.where(
					and(
						eq(event.id, u.id),
						eq(event.title, u.before.title),
						u.before.description === null
							? isNull(event.description)
							: eq(event.description, u.before.description)
					)
				)
		);
		const results = await db.batch(statements as [(typeof statements)[0], ...typeof statements]);
		const restored = results.reduce((n, r) => n + r.rowsAffected, 0);
		console.log(`\nUpdated ${restored} of ${plan.update.length} events.`);
		if (restored < plan.update.length) {
			console.log(
				`${plan.update.length - restored} changed since planning (a keeper edit?) and were ` +
					`skipped. Re-run the dry run to review them.`
			);
		}
		if (restored > 0) await refreshSite('the restored text is');
	} finally {
		close();
	}
}
