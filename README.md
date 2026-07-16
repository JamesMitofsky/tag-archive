# TAG Archive

Archive of artefacts from the Temperance Alley Garden (TAG). Built with
SvelteKit, Drizzle, and Turso (libsql), managed in [Conductor](https://conductor.build).

## Data model

One table, `artefact` (`src/lib/server/db/schema.ts`), mirroring the source
export:

| Column                 | Notes                                        |
| ---------------------- | -------------------------------------------- |
| `id`                   | Integer PK (from source `ID`)                |
| `artefact`             | Title                                        |
| `event`                | Event it came from; nullable                 |
| `date`                 | ISO `YYYY-MM-DD`                             |
| `provenance`           | Contributors — JSON `string[]`               |
| `programArea`          | TAG program tags — JSON `string[]`           |
| `description`          | Nullable                                     |
| `fileName` / `fileUrl` | Attachment (split from source `File` column) |
| `location`             | Physical storage, e.g. `Binder` / `Bin`      |

Multi-value columns (`provenance`, `programArea`) are normalized to JSON arrays.

Seed data lives in `data/artefacts.json` (parsed from the original CSV export).
Editing the archive = edit that file and re-seed.

## Local database (Turso)

Local dev runs [`turso dev`](https://docs.turso.tech/local-development) — a local
libsql server serving a `local.db` SQLite file. No auth token needed locally;
`src/lib/server/db/index.ts` requires a token only for remote (`libsql://` /
`https://`) URLs.

Build and seed the local DB from scratch:

```sh
pnpm db:setup:local
```

That runs, in order:

1. `pnpm auth:schema` — generate Better Auth tables (`src/lib/server/db/auth.schema.ts`)
2. `drizzle-kit push --force` against `file:local.db` — create tables (`--force`
   because Conductor's shell is non-interactive)
3. `pnpm db:seed` — insert rows from `data/artefacts.json`

Tables after setup: `artefact`, `user`, `session`, `account`, `verification`.

Other DB scripts: `db:seed`, `db:push`, `db:generate`, `db:migrate`, `db:studio`.

## Attachments

Artefact files are hosted locally under `static/artefacts/` (served by SvelteKit
at `/artefacts/...`). They were downloaded from the source (expiring signed URLs)
and each `fileUrl` in `data/artefacts.json` rewritten to its local path, e.g.
`/artefacts/TAG-001.jpg`.

This is a stopgap. For a long-term host, upload the files to a bucket/CDN, point
each `fileUrl` at the new URL, and re-seed — no schema change needed.

## Conductor

`.conductor/settings.toml` defines the workspace lifecycle:

- **Setup** (on workspace create): `pnpm install && pnpm db:setup:local`
- **Run** (`dev`, the default 🚀 button): starts DB + site together via
  `concurrently`
  - `db` → `turso dev` serving `local.db` on `CONDUCTOR_PORT+1`
  - `web` → `vite dev` on `CONDUCTOR_PORT`, with `DATABASE_URL` injected to point
    at the DB
- **`run_mode = "concurrent"`** — each workspace is its own git worktree with its
  own `local.db` and port range, so multiple workspaces run at once safely.

`.env` (gitignored) is copied into each new workspace via `file_include_globs`.
The run script overrides `DATABASE_URL`; `.env` still supplies `BETTER_AUTH_SECRET`,
`ORIGIN`, and a `file:local.db` fallback for standalone scripts. See `.env.example`.

Requires the Turso CLI: `brew install tursodatabase/tap/turso`.

## Developing without Conductor

```sh
pnpm install
pnpm db:setup:local
# terminal 1
turso dev --db-file local.db --port 8081
# terminal 2
DATABASE_URL=http://127.0.0.1:8081 pnpm dev
```

Or skip the server and point straight at the file: `DATABASE_URL=file:local.db pnpm dev`.

## Building

```sh
pnpm build      # production build
pnpm preview    # preview it
```

Deploy target uses the Netlify adapter.
