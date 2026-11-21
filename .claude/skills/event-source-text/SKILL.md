---
name: event-source-text
description: Load BEFORE touching how events get their title or description in this archive, and whenever the user asks for new or updated events ("get the new events on prod", "update events", "import events"), because it carries the workflow where Claude Code curates the events itself and hands the user the prod upload commands. That covers importing events from ustreetcommunity.org (pnpm events:fetch / events:curate / events:import / events:restore), editing anything in src/lib/server/events-import/, changing the Claude prompt or schema used to catalog events, adding or editing events in src/lib/data/seed-data.json, writing a script or migration that sets event.title or event.description, and writing or "cleaning up" an event's text by hand. Core rule this skill carries: an event's title and description are the source page's own words, copied verbatim, and never written, summarized, paraphrased, shortened or "tidied" by a model or a person. Also load it when something looks off about event text: "the descriptions don't match the site", "it didn't take the copy from the original events", "the import rewrote the text", or a mismatch error from events:import.
---

# Event titles and descriptions are the source's words

Every event in the archive comes from a page on ustreetcommunity.org. Its
**title** and **description** are that page's text, word for word. Nothing
between the page and the archive may rewrite them. That includes Claude,
`events.json` hand edits, seed edits, and scripts.

This is an archive. Its job is to keep what was published. A summary,
however accurate, replaces the record with someone's reading of it.

**The sitemap (`https://www.ustreetcommunity.org/sitemap.xml`) is the source
of truth** for an event's title and description: they must be the words its
page shows today, and nothing else about the event is changed to fit.

## Why this exists

The first catalog (about 1,300 events in `seed-data.json`) had descriptions
written by a model "in its own words": 30–70 word summaries in a neutral
house style. The import pipeline was then built to imitate that style, so it
kept summarizing new events too. For example:

- **Page:** "Join the Garden plants and critters for an evening of home-grown music –– somewhere between a house show and barnyard jam. … Bring a blanket to sit on and snacks to share :) produced by Lucy"
- **Archive:** "An informal musical gathering combining elements of a house show and barn jam, centered on live performances in a garden setting. …"

Titles drifted the same way ("Music in the Garden 🎶" became "Music in the
Garden!"). The fix made the pipeline copy the text, added a guard so a
rewrite can't slip back in, and added `events:restore` to put the originals
back.

## What may and may not be decided with judgment

| Field                                              | Source                                    | Who decides                                |
| -------------------------------------------------- | ----------------------------------------- | ------------------------------------------ |
| `title`                                            | page title                                | copied verbatim (outer whitespace trimmed) |
| `description`                                      | page body text, else excerpt, else `null` | copied verbatim by `htmlToText`            |
| `date`, `time`, `location`, `url`                  | page data                                 | copied by code                             |
| `hosts`                                            | names the page credits                    | Claude or a keeper (judgment)              |
| `series`                                           | which banner it belongs to                | Claude or a keeper (judgment)              |
| `mayHaveException`, `possibleExceptionDescription` | review flag                               | Claude or a keeper (judgment)              |

Claude reads the page only to decide the last three rows. Its output schema
(`curationSchema` in `curate-prompt.ts`) has no `title` or `description`
field, so it can't supply one.

## Where the rule is enforced

All in `src/lib/server/events-import/`:

- `squarespace.ts`
  - `verbatimText(raw)` is the one place an event's title and description
    come from. Curate, import and restore all use it.
  - `htmlToText` turns page HTML into the stored text. It uses a real parser
    (`htmlparser2`) and keeps every visible word in order, including link,
    button and caption text.
  - Paragraphs become blank lines; `<br>`, list items and pre-wrap newlines
    become line breaks.
  - It drops scripts, styles, hidden fallbacks and layout whitespace.
  - Descriptions render with `whitespace-pre-line`, so the breaks show on
    the site.
- `verbatim.ts`
  - `verbatimMismatches(entries, pages)` compares entries with their saved
    pages.
  - `events:import` refuses the whole file if any title or description
    differs, or if an entry has no saved page to check. There is no override
    flag. The fix is to re-run `events:curate`, never to edit the text.
- `curate-prompt.ts` tells Claude the text is the page's own, shows it
  examples without descriptions, and bumps `PROMPT_VERSION` whenever the
  prompt changes, so cached curations are redone.
  - `decisionsFileSchema` is the shape of a session's `decisions.json`. It is
    strict, so a decision can't carry a title or description.
  - `pageForCuration` is the page input both the API and the handoff use.
- Tests pin all of this: `verbatim.spec.ts`, `squarespace.spec.ts`,
  `curate-prompt.spec.ts` and `restore-core.spec.ts`. If you change a rule,
  change its test in the same commit, and say why.

## Workflows

### When the user asks for new events (Claude Code does the curating)

When the user asks for new events, for prod or otherwise, Claude Code prepares
`events.json` itself and hands back the prod commands. **It never runs
anything against the production database**; the user runs the upload.

`/login` signs in Claude Code only. The Anthropic SDK that `events:curate`
calls needs its own `ANTHROPIC_API_KEY` or `ant auth login` profile, and
usually has neither. So the session curates in place of the API, through the
same guards:

1. `pnpm events:fetch` saves new pages to `temp/events-import/raw/`. Read
   `fetch-report.json` for `failed` and `gone`.
2. `pnpm events:curate --handoff` makes no API calls. It writes
   `temp/events-import/handoff/`:
   - `system.md`: the exact system prompt the API gets, with the series
     banner list and its rules.
   - `pages.jsonl`: one `{url, page}` per new page, the same input the API
     gets.
3. Curate every line of `pages.jsonl` by the rules in `system.md`. For more
   than about 50 pages, split it (`split -l 47 -d -a 1 pages.jsonl chunk-`)
   and give each chunk to a parallel subagent that writes its own
   `decisions-N.json`.
   - Write `temp/events-import/decisions.json` as one array of
     `{url, hosts, series, mayHaveException, possibleExceptionDescription}`.
   - `decisionsFileSchema` is strict. A decision with a `title` or
     `description` key is rejected, so never add one.
4. `pnpm events:curate --decisions temp/events-import/decisions.json` builds
   the entries through `toEventSource`, the same path as an API run: unknown
   banners are dropped, hosts are trimmed, and the text is copied verbatim.
   It then writes `events.json`.
5. Check the result before handing it over:
   - Every page has an entry and the counts add up.
   - Any `series` is a real banner.
   - Spot-check a few hosts against their pages.
   - Count the entries dated after today. Import skips those unless
     `--include-upcoming`, so tell the user how many there are.
   - Run the import's verbatim check against a local database, never prod:
     `DATABASE_URL` from `.env`, no `--apply`.
6. Give the user this, ready to paste:
   - a summary with counts: new, flagged with the reason for each, with a
     series, upcoming, and gone pages;
   - the dry run, then the apply, each one self-contained so it loads the
     prod credentials in a subshell. A `!` command in Claude Code runs in a
     fresh shell, so credentials loaded by one command are gone by the next.
     Never split them into a separate "load" step.

```sh
( set -a; . ./.env.netlify-production; set +a; pnpm events:import )
( set -a; . ./.env.netlify-production; set +a; IMPORT_CONFIRM=1 VERCEL_TOKEN='<token>' \
  pnpm events:import --apply --as <keeper email> --write-seed )
```

Run them from an up-to-date `main`, since that is the code prod runs.

- Every imported event is public as soon as it is in.
- By default the events also land in the keeper review queue
  (`/keeper/settings/review/events`) for an admin to check. `--publish` lands
  them already approved.
- Any `--apply` to a remote database purges the site's `archive` cache
  afterwards, so it needs `VERCEL_TOKEN` and the linked Vercel project
  (`.vercel/project.json`). Without the token the import refuses before
  writing anything.
- `--write-seed` appends exactly what the database inserted (`seedAdditions`
  applies the import's own skip rules) to `src/lib/data/seed-data.json`.
  Remind the user to commit it.

### Import new events (API curation)

```sh
pnpm events:fetch                # new pages only → temp/events-import/raw/
pnpm events:curate               # hosts/series/flags → temp/events-import/events.json
# review events.json: edit hosts, series and flags only
DATABASE_URL='libsql://…' DATABASE_AUTH_TOKEN='…' pnpm events:import            # dry run
DATABASE_URL='libsql://…' DATABASE_AUTH_TOKEN='…' IMPORT_CONFIRM=1 VERCEL_TOKEN='…' \
  pnpm events:import --apply --as you@example.com --write-seed
```

If an import refuses with "does not keep the page's own title and
description", either a page changed since it was fetched or someone edited
the text. Run `pnpm events:fetch --refresh`, then `pnpm events:curate --force`
for those pages.

### Restore originals in archived events

```sh
pnpm events:fetch --all                        # every event's page (~25 min, read-only)
pnpm events:restore --seed                     # dry run against seed-data.json
pnpm events:restore --seed --apply             # rewrite it
DATABASE_URL='libsql://…' DATABASE_AUTH_TOKEN='…' pnpm events:restore --db     # dry run
DATABASE_URL='libsql://…' DATABASE_AUTH_TOKEN='…' IMPORT_CONFIRM=1 VERCEL_TOKEN='…' \
  pnpm events:restore --db --apply --as you@example.com
```

Every run writes the full before/after to
`temp/events-import/restore-report.json`. Read it before `--apply`.

## Traps

- **Changing a title in the seed can break links.** `seed-core.ts` groups
  events into series and links artefacts to events by title
  (`seriesBanners`, `artefactEventIndexes`).
  - `planSeedRestore` handles this. A retitled event keeps its old series key
    through an explicit `series`, and an artefact naming the old title is
    pointed at the new one.
  - It then recomputes both and throws if either changed.
  - Any other script that changes seed titles must do the same.
- **Keeper edits in production must survive.** `planDbRestore` restores a
  field only while it still equals what the original import wrote. That
  value is read from git: the seed at `BASELINE_REV` in `restore.ts`, from
  before the seed was restored.
  - Anything else is a keeper's edit. It is listed under `keeperEdited` and
    left alone.
  - Updates re-check the expected text inside one transaction.
- **Don't "fix" the source's spelling or style.** The US-English rule in
  `AGENTS.md` covers UI copy and code, not archival text. A page's British
  spellings, emoji, typos, odd capitalization and doubled dashes stay.
- **A URL can now show a different event.** Squarespace pages get reused
  and rescheduled. For example, the 2023 "Tarot and Tea in the Garden" URL
  now shows a 2026 "TRANSPLANT DAY" page.
  - Restore only trusts a page while its date equals the event's date.
  - Anything else is listed under `pageMoved` and left as it is. Restore
    never copies text across a date mismatch.
  - Some seed URLs are shifted by one along chains of copied pages: each
    event points at the previous event's page. The report lists each moved
    event's `sameDatePages` as likely real pages.
  - An event's real page can then look new to `events:import`. Import skips
    entries matching an existing event's date and title, ignoring case,
    punctuation and spacing (`titleKey`), so it isn't imported twice.
- **Titles arrive HTML-escaped.** Squarespace serves `Seeds &amp; Snacks`.
  `toRawEvent` decodes titles with `entities`. Decoding is the only change
  allowed; anything more is a rewrite.
- **Pages that are gone.** If a page no longer exists, the event keeps its
  current text. `fetch-report.json` lists such pages under `gone`. Don't
  invent replacement text. If the original matters, recover it from a web
  archive copy of the page and put it in word for word.
- **No summaries anywhere else either.** Don't fill a missing description
  with a sentence built from the title. An empty description stays `null`,
  and the entry is flagged for review.
