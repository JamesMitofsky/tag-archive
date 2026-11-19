# Agent notes

Guidance for coding agents working in this repository.

## Spelling

Use US English spellings everywhere: UI copy (labels, buttons, toasts, error
messages, emails), docs, code comments, and identifiers. Write color, center,
behavior, canceled, organize, gray and so on.

The one exception is **artefact** / **artefacts**, which keeps its British
spelling. It is the archive's own word for its items and runs through the
routes (`/keeper/artefacts`), the database schema and the hand-drawn art
(`static/drawing/text/artefacts.webp`), so never "correct" it to
artifact.

Leave quoted archival content as it was written (event and artefact
descriptions, venue and organization names, such as those in
`src/lib/data/seed-data.json`), even where it uses British spellings.

## Event titles and descriptions

An event's title and description are the source page's own words, copied
verbatim from ustreetcommunity.org. Never write, summarize, paraphrase or tidy
them, whether by model or by hand. Claude may only decide hosts, series and the
review flag. The import pipeline enforces this. Read
`.claude/skills/event-source-text/SKILL.md` before touching
`src/lib/server/events-import/`, the events in `src/lib/data/seed-data.json`, or
anything that sets an event's title or description.
