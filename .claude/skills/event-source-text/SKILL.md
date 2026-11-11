---
name: event-source-text
description: Load BEFORE touching how events get their title or description in this archive. That covers importing events from ustreetcommunity.org (pnpm events:fetch / events:curate / events:import / events:restore), editing anything in src/lib/server/events-import/, changing the Claude prompt or schema used to catalog events, adding or editing events in src/lib/data/seed-data.json, writing a script or migration that sets event.title or event.description, and writing or "cleaning up" an event's text by hand. Core rule this skill carries: an event's title and description are the source page's own words, copied verbatim, and never written, summarized, paraphrased, shortened or "tidied" by a model or a person. Also load it when something looks off about event text: "the descriptions don't match the site", "it didn't take the copy from the original events", "the import rewrote the text", or a mismatch error from events:import.
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
- Tests pin all of this: `verbatim.spec.ts`, `squarespace.spec.ts`,
  `curate-prompt.spec.ts` and `restore-core.spec.ts`. If you change a rule,
  change its test in the same commit, and say why.

## Workflows

### Import new events

```sh
pnpm events:fetch                # new pages only → temp/events-import/raw/
pnpm events:curate               # hosts/series/flags → temp/events-import/events.json
# review events.json: edit hosts, series and flags only
DATABASE_URL='libsql://…' DATABASE_AUTH_TOKEN='…' pnpm events:import            # dry run
DATABASE_URL='libsql://…' DATABASE_AUTH_TOKEN='…' IMPORT_CONFIRM=1 \
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
DATABASE_URL='libsql://…' DATABASE_AUTH_TOKEN='…' IMPORT_CONFIRM=1 NETLIFY_AUTH_TOKEN='…' \
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
