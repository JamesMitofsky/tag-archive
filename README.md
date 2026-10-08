# TAG Archive

Archive of artefacts from the Temperance Alley Garden (TAG). Built with
SvelteKit, Drizzle, and Turso (libsql), managed in [Conductor](https://conductor.build).

## Quickstart (no Conductor)

Prerequisites: Node + [pnpm](https://pnpm.io), the [Turso CLI](https://docs.turso.tech)
(`brew install tursodatabase/tap/turso`), and — for scan uploads — Docker running.

```sh
cp .env.example .env   # defaults are fine for local dev
pnpm install
pnpm db:setup:local    # create + seed local.db (once)
pnpm dev:local         # DB + RustFS storage + Drizzle Studio + site, wired together
```

Open <http://localhost:5173>. `pnpm dev:local` runs the database, the RustFS S3
store (dev stand-in for Cloudflare R2), [Drizzle Studio](https://local.drizzle.studio)
for inspecting the DB, and the site together; Ctrl-C stops all. No Docker? It still
starts the DB + site — only scan uploads are disabled.

Safe to re-run anytime: on boot the script force-frees its ports (`8081`, `4983`)
and removes any stale RustFS container, and on exit a trap removes the container —
so a dirty Ctrl-C never blocks the next launch.

On boot it also seeds a few sample scan images into the bucket and attaches them to
the first artefacts (`scripts/seed-images.mjs`). The store is ephemeral, so this
re-runs each boot; re-attach by hand with `pnpm db:seed:images`. If a scan upload
ever 404s with `NoSuchBucket` (e.g. the storage container restarted alone), the
upload path recreates the bucket and retries — no restart needed.

More detail (individual services, Drizzle Studio, prod storage) is below.

## Data model

One table, `artefact` (`src/lib/server/db/schema.ts`), mirroring the source
export:

| Column        | Notes                                                     |
| ------------- | --------------------------------------------------------- |
| `id`          | Integer PK (from source `ID`)                             |
| `artefact`    | Title                                                     |
| `event`       | Event it came from; nullable                              |
| `date`        | ISO `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`; NULL when undated |
| `provenance`  | Contributors — JSON `string[]`                            |
| `programArea` | TAG program tags — JSON `string[]`                        |
| `description` | Nullable                                                  |
| `fileUrl`     | Public URL of the attached scan image                     |
| `location`    | Physical storage, e.g. `Binder` / `Bin`                   |

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

That runs `scripts/db-setup.sh`: it boots a throwaway `turso dev` and does the
following against its libsql URL (not `file:local.db`, so nothing double-writes the
SQLite file), then stops it:

1. `pnpm auth:schema` — generate Better Auth tables (`src/lib/server/db/auth.schema.ts`)
2. `drizzle-kit push --force` — create tables (`--force` because Conductor's shell
   is non-interactive)
3. `pnpm db:seed` — insert rows from `data/artefacts.json`

Tables after setup: `artefact`, `user`, `session`, `account`, `verification`.

Other DB scripts: `db:seed`, `db:seed:images`, `db:push`, `db:generate`, `db:migrate`, `db:studio`.

## Attachments

Two sources feed an artefact's `fileUrl`:

**Seed files (legacy).** The original export's files live under `static/artefacts/`
(served by SvelteKit at `/artefacts/...`). Each `fileUrl` in `data/artefacts.json`
was rewritten to its local path, e.g. `/artefacts/TAG-001.jpg`.

**Scanned uploads (new).** The contribution form at `/contribute` (the cloud
keeper button) has a page scanner: photograph pages with the device camera, crop
them client-side, and upload each as WebP to `POST /api/scans`
(`src/routes/api/scans/+server.ts`), which streams it to an S3-compatible bucket
via `src/lib/server/scans.ts`. The stored type is sniffed from the bytes, never
taken from the client.

Anyone in the garden can contribute; only admins sign in (at `/keeper`, deliberately
unlinked). An admin's artefact lands vetted. Anyone else's lands as a proposed
addition, hidden from the public site until an admin approves it in the review
queue. Anonymous writes are guarded by:

- **The garden tag** (see [Access](#access)): a tap also issues a signed
  draft-session cookie (`src/lib/server/drafts.ts`), fresh for the same three hours.
  Uploads land in that draft's own `submissions/<draft>/` space; only it can delete
  from there, and a submission can only attach images from there. A re-tap renews
  the same draft, so a visitor whose time ran out mid-form loses nothing.
- **Rate limits** backed by the `rate_limit` table (`src/lib/server/rateLimit.ts`).
- **A daily sweep** (`netlify/functions/sweep-submissions.mts` →
  `/api/cron/sweep-submissions`) that deletes abandoned uploads and stale counters.

After submitting, a contributor may optionally leave a name or email for the
keepers (`submission_contact`, never published).

### Scan storage (R2 in prod, RustFS in dev)

`scans.ts` speaks the S3 API, so the same code targets two backends via env:

| Env var                | Prod (R2)                         | Local dev (RustFS)                  |
| ---------------------- | --------------------------------- | ----------------------------------- |
| `R2_ACCESS_KEY_ID`     | R2 API token access key           | `rustfsadmin`                       |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret               | `rustfsadmin`                       |
| `R2_BUCKET`            | bucket name                       | `tag-archive`                       |
| `R2_PUBLIC_URL`        | bucket public URL (`pub-…r2.dev`) | injected by the run script          |
| `S3_ENDPOINT`          | _(unset)_ → derived from account  | injected by the run script (RustFS) |
| `S3_REGION`            | _(unset)_ → `auto`                | `auto`                              |
| `R2_ACCOUNT_ID`        | Cloudflare account id             | _(unset)_                           |

- **Prod:** no `S3_ENDPOINT`, so `scans.ts` derives the R2 host from `R2_ACCOUNT_ID`.
  Set all `R2_*` in Netlify → Site settings → Environment variables (`.env.production`
  is **not** read by the deployed site). Credentials are server-only
  (`$env/dynamic/private`) — they never reach the browser.
- **Local:** the run script starts a [RustFS](https://github.com/rustfs/rustfs)
  container (a maintained, S3-compatible object store) and points `S3_ENDPOINT`
  / `R2_PUBLIC_URL` at it, so dev uploads never touch the prod bucket. See below.

## Access

The whole site opens only to people in the garden. An NXP **NTAG 424 DNA** tag
there rewrites its URL on every tap (Secure Dynamic Messaging): `e` carries the
tag's UID and tap counter, AES-encrypted, and `c` a MAC over them. `GET /t`
(`src/routes/t/+server.ts`) verifies the MAC (`src/lib/server/nfc/sdm.ts`), accepts
the tap only if its counter beats every one this tag has sent before (the `nfc_tag`
table, `src/lib/server/nfc/taps.ts` — so a copied URL can't be replayed), then sets
a signed **access pass** cookie good for three hours (`src/lib/access/pass.ts`) and
redirects to `/`.

The pass is checked twice, from one rule (`src/lib/access/gate.ts`):

- **At the edge** (`netlify/edge-functions/access-gate.ts`), in front of the CDN —
  the only layer that sees static scans and audio and cached responses like
  `/api/dataset`, none of which ever reach SvelteKit.
- **In `hooks.server.ts`**, for everything SvelteKit serves — and the only gate
  under `vite dev`, which doesn't run edge functions.

Without a pass, a page view lands on `/locked`; anything else gets a 401. Always
open: `/t`, `/locked`, keeper sign-in (`/keeper`, `/api/auth/*`), the cron
endpoint, and the app bundles and decor the locked page is drawn with.

**Keepers bypass the tag.** Signing in at `/keeper` issues the same pass and keeps
it topped up on every signed-in request.

**Keys.** `NFC_SDM_META_KEY` and `NFC_SDM_FILE_KEY` (32 hex characters each) are
the AES-128 keys written onto the tag. They are their own env vars, not derived
from `BETTER_AUTH_SECRET`, so rotating the auth secret never bricks the tag.
Production refuses taps when they are unset or left at the all-zero factory
default. The pass itself is signed with a key derived from `BETTER_AUTH_SECRET`,
which the edge function also reads — so that variable must be available to
functions (its scope in Netlify must include Functions).

**Trying it locally.** `.env.example` ships NXP's all-zero test keys, which dev
accepts. With the site running, `pnpm nfc:tap` prints a valid tap URL for a fresh
random tag; open it to be let in. `pnpm nfc:tap --uid 04AABBCCDDEEFF --counter 7`
twice shows a replay refused. Add `--base https://<tunnel>` to test on a phone.

**Programming a tag** (e.g. the iPhone app "Secure NTAG 424 DNA", or NFC Ideas
on a Mac with an ACR1252U):

1. Generate three keys with `openssl rand -hex 16`: the meta key, the file key,
   and a new app master key. Keep all three in a password manager; set the first
   two in Netlify.
2. Change **key 0 (the app master key)** from its default — otherwise anyone with
   the same app can rewrite the tag.
3. Write the NDEF URL
   `https://<site>/t?e=00000000000000000000000000000000&c=0000000000000000`.
4. Enable SDM: encrypted PICC data with UID and counter mirroring at the `e=`
   offset; SDMMAC at the `c=` offset, with the **MAC input offset equal to the MAC
   offset**; SDM meta-read → the meta key's slot; SDM file-read → the file key's
   slot; read counter on.
5. Set the NDEF file's **write access to key 0** (read stays free).
6. Tap it with a phone: you should land on `/` with a "welcome in" note, and the
   URL should change with every tap.

Taps register their tag automatically (only a holder of the keys can produce a
valid one). To retire a lost tag, set its `revoked_at` in the `nfc_tag` table
(Drizzle Studio).

Known limits, accepted for now: scans uploaded to R2 stay reachable by their
direct (random, unguessable) URL; search engines see only `/locked`; and an
iPhone opens the tapped link in a new Safari tab — a `/locked` tab left open
moves on by itself when the visitor returns to it.

## Conductor

`.conductor/settings.toml` defines the workspace lifecycle:

- **Setup** (on workspace create): `pnpm install && pnpm db:setup:local`
- **Run** (`dev`, the default 🚀 button): starts DB + RustFS + Studio + site
  together via `concurrently`
  - `db` → `turso dev` serving `local.db` on `CONDUCTOR_PORT+1`
  - `rustfs` → RustFS S3 store on `CONDUCTOR_PORT+2` (dev stand-in for R2);
    `scripts/init-bucket.mjs` creates the bucket + public-read policy on boot.
    Data is ephemeral (no volume) — the bucket is recreated each boot
  - `studio` → `drizzle-kit studio` backend on `CONDUCTOR_PORT+3` (UI at
    <https://local.drizzle.studio>)
  - `web` → `vite dev` on `CONDUCTOR_PORT`, with `DATABASE_URL`, `S3_ENDPOINT`,
    and `R2_PUBLIC_URL` injected to point at the local DB + RustFS
  - On startup the run frees ports `CONDUCTOR_PORT+1` / `+3` and removes any stale
    RustFS container; an exit trap removes the container — so relaunches stay clean
- **`run_mode = "concurrent"`** — each workspace is its own git worktree with its
  own `local.db` and port range, so multiple workspaces run at once safely.

`.env` (gitignored) is copied into each new workspace via `file_include_globs`,
along with `.env.production`. The run script overrides `DATABASE_URL`, `S3_ENDPOINT`,
and `R2_PUBLIC_URL`; `.env` supplies the RustFS credentials, `BETTER_AUTH_SECRET`,
and `ORIGIN`. See `.env.example`.

Requires:

- Turso CLI: `brew install tursodatabase/tap/turso`
- Docker (for the local RustFS container) — Docker Desktop running before you hit Run.

## Developing without Conductor

One command brings up the database, RustFS, Drizzle Studio, and the site, wired
together (mirrors the Conductor `dev` run on fixed ports — web `5173`, DB `8081`,
Studio `4983`, RustFS `9000`). Needs the Turso CLI; Docker is optional (see below):

```sh
pnpm install
pnpm db:setup:local   # once — boots a throwaway sqld and seeds local.db over its URL
pnpm dev:local        # db + rustfs + studio + site, all wired
```

`pnpm dev:local` runs `scripts/dev-local.sh` (via `concurrently`): starts `turso dev`,
a RustFS container, `drizzle-kit studio`, runs `scripts/init-bucket.mjs`, then
`vite dev` with `DATABASE_URL`, `S3_ENDPOINT`, and `R2_PUBLIC_URL` injected. Ctrl-C
stops all. **Docker not running?** It degrades to DB + Studio + site only (scan
uploads disabled) instead of failing.

**Safe relaunch:** the script force-frees ports `8081` + `4983` and force-removes any
leftover RustFS container on startup, and an exit trap removes the container on
teardown. So even a dirty Ctrl-C (Docker or `drizzle-kit studio` surviving `SIGTERM`)
never leaves a held port or orphaned container to block the next `pnpm dev:local`.

The DB is always reached over its libsql **URL** (`http://127.0.0.1:8081`, served by
`turso dev`) — never `file:local.db` directly — so nothing double-writes the SQLite
file. `db:setup:local` even spins up its own ephemeral sqld to seed over that URL.

Prefer separate terminals, or only need some pieces? Each part has its own script:

```sh
pnpm dev:db            # turso dev serving local.db on :8081
pnpm dev:storage       # RustFS S3 store on :9000
pnpm dev:storage:init  # create the bucket + public-read policy (once RustFS is up)
DATABASE_URL=http://127.0.0.1:8081 \
  S3_ENDPOINT=http://127.0.0.1:9000 \
  R2_PUBLIC_URL=http://127.0.0.1:9000/tag-archive pnpm dev   # the site
```

Not exercising scan uploads? Run `pnpm dev:db` + `DATABASE_URL=http://127.0.0.1:8081 pnpm dev`.

Inspect the local DB with Drizzle Studio (opens at <https://local.drizzle.studio>).
`pnpm dev:local` already starts it on `:4983`. To run it standalone (e.g. alongside
`pnpm dev:db` only), start the DB first, then point Studio at its URL:

```sh
DATABASE_URL=http://127.0.0.1:8081 pnpm db:studio
```

## Testing on a phone (ngrok)

Bare minimum — dev server already running on `:5173`:

If not already done, run `ngrok config add-authtoken <token>` to connect your system to your free ngrok domain. Then put that domain in as a flag to host against:

```sh
ngrok http 5173 --url=nervous-balmy-crispy.ngrok-free.dev
```

Use the **HTTPS** URL, not your Mac's LAN IP. The scanner calls
`navigator.mediaDevices.getUserMedia`, which only exists in a secure context —
over plain `http://192.168.x.x:5173` the camera is silently unavailable and
`PageScanner` falls back to its no-camera path.

`vite.config.ts` allowlists the `ngrok-free.dev` / `ngrok-free.app` / `ngrok.dev` /
`ngrok.app` wildcards so Vite's DNS-rebinding guard doesn't reject the tunnel's
`Host` header.

Login on the phone also needs `ORIGIN` in `.env` to match the tunnel URL
(better-auth uses it as `baseURL`):

```sh
# .env → ORIGIN="https://nervous-balmy-crispy.ngrok-free.dev"
```

The `--url=` domain is a free reserved dev domain, so it stays the same across
runs and `ORIGIN` only has to be set once. It's tied to one ngrok account.

The tunnel exposes the dev server and `local.db` to anyone with the URL. Ctrl-C
when done.

## Building

```sh
pnpm build      # production build
pnpm preview    # preview it
```

Deploy target uses the Netlify adapter.
