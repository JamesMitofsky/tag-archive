/**
 * Planning for `events:restore`: put back each archived event's original title
 * and description, word for word from its page, wherever the archive holds a
 * paraphrase instead. Pure, so every rule here is unit-tested; restore.ts does
 * the file, git and database I/O.
 *
 * A page is only trusted for an event while its date still matches the
 * event's. Squarespace pages get reused — a 2023 "Tarot and Tea" URL now shows
 * a 2026 "TRANSPLANT DAY" — and rescheduled, so a page dated differently may
 * describe another event entirely. Those are listed as `pageMoved` for a
 * person to look at, never restored automatically.
 *
 * Two targets, two sets of rules:
 *
 * - The seed file (local dev's source). Its series banners and artefact→event
 *   links are matched by event TITLE, so changing a title could silently move
 *   an event out of its series or unlink an artefact. The plan keeps both
 *   exactly as they were: a retitled event keeps its old series key through an
 *   explicit `series`, and an artefact naming the old title is pointed at the
 *   new one. It then recomputes both and refuses to return a plan that changed
 *   either.
 *
 * - A live database. Rows link by id, so titles can change freely, but keepers
 *   edit events through the UI and those edits must survive. A field is only
 *   restored while it still holds exactly what the original import wrote (the
 *   baseline seed); anything else is a keeper's edit and is left alone.
 */
import {
	artefactEventIndexes,
	seriesBanners,
	type EventSource,
	type SeedData
} from '../db/seed-core';
import { verbatimText, type RawEvent } from './squarespace';
import { sameText, type VerbatimText } from './verbatim';

/** An archived event whose page is now dated differently, so it may be another event. */
export type PageMoved = {
	url: string;
	archived: { date: string; title: string };
	page: { date: string; title: string };
	/**
	 * Saved pages dated like the archived event: likely its real page, for the
	 * person reviewing it (the seed's URLs are sometimes shifted along a chain
	 * of copied pages). Suggestions only; nothing is matched automatically.
	 */
	sameDatePages: { url: string; title: string }[];
};

export type TextChange = {
	url: string;
	date: string;
	before: VerbatimText;
	after: VerbatimText;
	/**
	 * `restored`: the page's own words put back. `cleared`: no usable page, so
	 * the AI-written summary the original import stored is removed (description
	 * set to null) rather than kept in the archive.
	 */
	kind: 'restored' | 'cleared';
};

/**
 * True when `description` is still, word for word, the AI-written summary the
 * original import stored for this URL — the only text `cleared` ever removes.
 */
const isImportedSummary = (
	description: string | null,
	baseline: VerbatimText | undefined
): baseline is VerbatimText => !!description && !!baseline && description === baseline.description;

export type SeedRestorePlan = {
	/** The seed with every restorable title and description put back. */
	data: SeedData;
	changes: TextChange[];
	/** Events whose text already matches their page. */
	alreadyVerbatim: number;
	/** Events with a URL but no saved page (gone from the site, or not fetched). */
	noPage: EventSource[];
	/** Events whose page is dated differently now; left as they are. */
	pageMoved: PageMoved[];
	/** Events with no source URL, which can't be checked. */
	noUrl: number;
	/** Retitled events given an explicit `series` so they keep their banner. */
	pinnedSeries: { url: string; title: string; series: string }[];
	/** Artefacts whose `event` text now names their event's restored title. */
	relinkedArtefacts: { id: number; from: string; to: string }[];
};

const seriesKey = (e: EventSource) => e.series?.trim() || e.title.trim();

/** Builds `pageMoved` entries, indexing the saved pages by date on first use. */
export function movedPages(rawByUrl: Map<string, RawEvent>) {
	let byDate: Map<string, RawEvent[]> | null = null;
	return (url: string, e: { date: string; title: string }, raw: RawEvent): PageMoved => {
		if (!byDate) {
			byDate = new Map();
			for (const r of rawByUrl.values()) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
		}
		return {
			url,
			archived: { date: e.date, title: e.title },
			page: { date: raw.date, title: raw.title },
			sameDatePages: (byDate.get(e.date) ?? []).map((r) => ({ url: r.url, title: r.title }))
		};
	};
}

/**
 * Restore the seed's titles and descriptions from saved pages, keeping every
 * series banner and artefact link the seed resolved before. Throws if it can't.
 *
 * Events with no usable page (gone, or now dated differently) can't get their
 * words back; their description is cleared while it is still the summary the
 * original import wrote (`baselineByUrl`), and their title is left as it is.
 */
export function planSeedRestore(
	seed: SeedData,
	rawByUrl: Map<string, RawEvent>,
	baselineByUrl: Map<string, VerbatimText>
): SeedRestorePlan {
	const data = structuredClone(seed);
	const before = seed.events;
	const bannersBefore = seriesBanners(before);
	const linksBefore = artefactEventIndexes(before, seed.artefacts);

	const changes: TextChange[] = [];
	const noPage: EventSource[] = [];
	const pageMoved: PageMoved[] = [];
	const moved = movedPages(rawByUrl);
	let alreadyVerbatim = 0;
	let noUrl = 0;
	const retitled = new Set<number>();

	const clearSummary = (e: EventSource) => {
		if (!isImportedSummary(e.description, baselineByUrl.get(e.url!))) return;
		changes.push({
			url: e.url!,
			date: e.date,
			before: { title: e.title, description: e.description },
			after: { title: e.title, description: null },
			kind: 'cleared'
		});
		e.description = null;
	};

	data.events.forEach((e, i) => {
		if (!e.url) {
			noUrl++;
			return;
		}
		const raw = rawByUrl.get(e.url);
		if (!raw) {
			noPage.push(before[i]);
			clearSummary(e);
			return;
		}
		if (raw.date !== e.date) {
			pageMoved.push(moved(e.url, e, raw));
			clearSummary(e);
			return;
		}
		const source = verbatimText(raw);
		const same = sameText(e, source);
		if (same.title && same.description) {
			alreadyVerbatim++;
			return;
		}
		const old = { title: e.title, description: e.description };
		if (!same.title) {
			e.title = source.title;
			retitled.add(i);
		}
		if (!same.description) e.description = source.description;
		changes.push({
			url: e.url,
			date: e.date,
			before: old,
			after: { title: e.title, description: e.description },
			kind: 'restored'
		});
	});

	// Series: a retitled event without an explicit `series` was grouped by its
	// old title. Pin it to that old key whenever its banner would otherwise
	// change — leaving a banner, joining one, or forming a new one with others.
	const pinnedSeries: SeedRestorePlan['pinnedSeries'] = [];
	const pin = (i: number) => {
		const key = seriesKey(before[i]);
		data.events[i].series = key;
		pinnedSeries.push({ url: data.events[i].url!, title: data.events[i].title, series: key });
	};
	const pinned = new Set<number>();
	for (;;) {
		const banners = seriesBanners(data.events);
		const toPin = [...retitled].filter(
			(i) => !pinned.has(i) && !before[i].series?.trim() && banners[i] !== bannersBefore[i]
		);
		if (toPin.length === 0) break;
		for (const i of toPin) {
			pin(i);
			pinned.add(i);
		}
	}
	const bannersAfter = seriesBanners(data.events);
	const movedSeries = bannersAfter.flatMap((b, i) => (b === bannersBefore[i] ? [] : [i]));
	if (movedSeries.length) {
		throw new Error(
			`Restoring titles would change the series of ${movedSeries.length} events: ` +
				movedSeries
					.slice(0, 10)
					.map(
						(i) =>
							`${before[i].date} "${before[i].title}" (${bannersBefore[i]} → ${bannersAfter[i]})`
					)
					.join('; ')
		);
	}

	// Artefacts: point any artefact that named a retitled event at its new title.
	const relinkedArtefacts: SeedRestorePlan['relinkedArtefacts'] = [];
	const linksMid = artefactEventIndexes(data.events, data.artefacts);
	data.artefacts.forEach((a, k) => {
		const target = linksBefore[k];
		if (target === null || linksMid[k] === target) return;
		const to = data.events[target].title;
		relinkedArtefacts.push({ id: a.id, from: a.event ?? '', to });
		a.event = to;
	});
	const linksAfter = artefactEventIndexes(data.events, data.artefacts);
	const movedLinks = linksAfter.flatMap((l, k) => (l === linksBefore[k] ? [] : [k]));
	if (movedLinks.length) {
		throw new Error(
			`Restoring titles would change which event ${movedLinks.length} artefacts link to: ` +
				movedLinks
					.map((k) => `artefact ${seed.artefacts[k].id} "${seed.artefacts[k].event}"`)
					.join('; ')
		);
	}

	return {
		data,
		changes,
		alreadyVerbatim,
		noPage,
		pageMoved,
		noUrl,
		pinnedSeries,
		relinkedArtefacts
	};
}

/** An event row as `events:restore --db` reads it. */
export type DbEventRow = {
	id: number;
	url: string | null;
	date: string;
	title: string;
	description: string | null;
};

export type DbFieldEdit = {
	id: number;
	url: string;
	date: string;
	field: 'title' | 'description';
	current: string | null;
	original: string | null;
	page: string | null;
};

export type DbRestorePlan = {
	/** Rows to rewrite: `before` is what the update expects to find, `after` what it writes. */
	update: (TextChange & { id: number })[];
	/** Rows whose text already matches their page. */
	alreadyVerbatim: number;
	/** Fields a keeper changed since the import; never overwritten. */
	keeperEdited: DbFieldEdit[];
	/** Rows whose URL the baseline seed doesn't have, so an edit can't be ruled out. */
	noBaseline: DbEventRow[];
	/** Rows with a URL but no saved page. */
	noPage: DbEventRow[];
	/** Rows whose page is dated differently now; left as they are. */
	pageMoved: PageMoved[];
	noUrl: number;
};

/**
 * Decide, field by field, which database rows get their page's text back. A
 * field is restored only when it still equals the baseline (what the original
 * import wrote), so a keeper's correction is never overwritten — that field is
 * reported instead, and the row's other field is still restored if untouched.
 * Rows with no usable page have their description cleared under the same rule:
 * only while it is still the imported summary.
 */
export function planDbRestore(
	rows: DbEventRow[],
	baselineByUrl: Map<string, VerbatimText>,
	rawByUrl: Map<string, RawEvent>
): DbRestorePlan {
	const moved = movedPages(rawByUrl);
	const plan: DbRestorePlan = {
		update: [],
		alreadyVerbatim: 0,
		keeperEdited: [],
		noBaseline: [],
		noPage: [],
		pageMoved: [],
		noUrl: 0
	};
	/** No usable page: drop the imported summary, if that is still what the row holds. */
	const clearSummary = (row: DbEventRow) => {
		if (!isImportedSummary(row.description, baselineByUrl.get(row.url!))) return;
		plan.update.push({
			id: row.id,
			url: row.url!,
			date: row.date,
			before: { title: row.title, description: row.description },
			after: { title: row.title, description: null },
			kind: 'cleared'
		});
	};
	for (const row of rows) {
		if (!row.url) {
			plan.noUrl++;
			continue;
		}
		const raw = rawByUrl.get(row.url);
		if (!raw) {
			plan.noPage.push(row);
			clearSummary(row);
			continue;
		}
		if (raw.date !== row.date) {
			plan.pageMoved.push(moved(row.url, row, raw));
			clearSummary(row);
			continue;
		}
		const source = verbatimText(raw);
		const current = { title: row.title, description: row.description };
		const same = sameText(current, source);
		if (same.title && same.description) {
			plan.alreadyVerbatim++;
			continue;
		}
		const baseline = baselineByUrl.get(row.url);
		if (!baseline) {
			plan.noBaseline.push(row);
			continue;
		}
		const untouched = sameText(current, baseline);
		const after = { ...current };
		const edit = (field: 'title' | 'description') =>
			plan.keeperEdited.push({
				id: row.id,
				url: row.url!,
				date: row.date,
				field,
				current: current[field],
				original: baseline[field],
				page: source[field]
			});
		if (!same.title) {
			if (untouched.title) after.title = source.title;
			else edit('title');
		}
		if (!same.description) {
			if (untouched.description) after.description = source.description;
			else edit('description');
		}
		const changed = sameText(after, current);
		if (!changed.title || !changed.description) {
			plan.update.push({
				id: row.id,
				url: row.url,
				date: row.date,
				before: current,
				after,
				kind: 'restored'
			});
		}
	}
	return plan;
}
