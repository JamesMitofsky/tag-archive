# TAG Archive

Archive of artefacts from the Temperance Alley Garden (TAG). Built with
SvelteKit, Drizzle, and Turso (libsql), managed in [Conductor](https://conductor.build).

## Quickstart (no Conductor)

Prerequisites: Node + [pnpm](https://pnpm.io), the [Turso CLI](https://docs.turso.tech)
(`brew install tursodatabase/tap/turso`), and — for scan and photograph uploads —
Docker running.

```sh
cp .env.example .env   # defaults are fine for local dev
pnpm install
pnpm db:setup:local    # create + seed local.db (once)
pnpm dev:local         # DB + RustFS storage + Drizzle Studio + site, wired together
```

Open <http://localhost:5173>. `pnpm dev:local` runs the database, the RustFS S3
store (dev stand-in for Cloudflare R2), [Drizzle Studio](https://local.drizzle.studio)
for inspecting the DB, and the site together; Ctrl-C stops all. No Docker? It still
starts the DB + site — only uploads are disabled.

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

The schema is `src/lib/server/db/schema.ts` (migrations in `drizzle/`); column
names below are as SQLite and Drizzle Studio show them. Every archive table
carries audit columns (`created_at` / `updated_at`, `created_by` / `updated_by`);
only the bookkeeping tables `rate_limit` and `nfc_tag` don't. `artefact`,
`event`, `series` and `image_set` also carry `proposed_addition`: true on a row
anyone but an admin created, until an admin vets it in the review queue, and
kept off the public site until then.

**Artefacts** are the archive's scanned items, one row each in `artefact`:

| Column         | Notes                                                         |
| -------------- | ------------------------------------------------------------- |
| `id`           | Integer PK, never reused (ids are written on the objects)     |
| `artefact`     | Title                                                         |
| `event_id`     | Event it came from (`event`); nullable                        |
| `date`         | ISO `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`; NULL when undated     |
| `program_area` | TAG program tags — JSON `string[]`                            |
| `description`  | Nullable                                                      |
| `file_urls`    | Public URLs of the attached scans, in order — JSON `string[]` |
| `location`     | Physical storage, e.g. `Binder` / `Bin`                       |

Provenance (who an artefact came from) is `person` rows linked through
`artefact_provenance`; events (grouped into a `series` when they recur) list
their hosts in `event_host`. A public submitter's optional contact details sit
in `submission_contact`, never published.

**Image sets** are photographs uploaded together (see [Photographs](#photographs)).
A set has no title, location or program areas; its label is derived
(`src/lib/images/label.ts`: the event's title, else the description's first
line, else "N photographs"). Three tables:

`image_set` — one row per set:

| Column        | Notes                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| `id`          | Integer PK                                                                 |
| `description` | Nullable                                                                   |
| `event_id`    | Event the photographs were taken at (`event`); nullable                    |
| `date`        | Partial ISO date like `artefact.date`; by default the earliest capture day |
| `date_auto`   | True while `date` follows the photographs; false once an admin set it      |

`image` — one row per photograph, two stored objects each:

| Column                            | Notes                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `id`                              | Integer PK; what a form submits to attach the photograph                                |
| `set_id`                          | Its set; NULL until a form attaches it (deleted with the set)                           |
| `position`                        | Display order within the set, from 0                                                    |
| `url`                             | Public URL of the WebP display copy                                                     |
| `original_url`                    | Public URL of the original, exactly as uploaded (unique)                                |
| `original_type` / `original_name` | The original's type as sniffed from its bytes; the device's file name                   |
| `original_bytes`                  | Size of the original                                                                    |
| `bytes` / `width` / `height`      | Size and pixel dimensions of the display copy                                           |
| `captured_at` / `captured_offset` | Wall-clock capture time (or just the day) and UTC offset, from the photo's own metadata |
| `metadata`                        | The original's parsed EXIF / GPS / XMP / IPTC, JSON; never published                    |

`image_set_contact` — a public submitter's optional name and email for a set,
the twin of `submission_contact`; never published.

Image rows are written when an upload is _finalized_, before any set exists, so
**unattached rows** (`set_id` NULL) are normal: they belong to a form someone is
still filling in, until it attaches them on save. Ones left unattached for a day
are swept with their objects.

Seed data lives in `src/lib/data/seed-data.json` (parsed from the original
exports): artefacts, events, series and people. Editing the archive's seed =
edit that file and re-seed.

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
3. `pnpm db:seed` — insert rows from `src/lib/data/seed-data.json`, plus an
   admin and a contributor test account

Tables after setup: the archive's (see [Data model](#data-model)) plus Better
Auth's `user`, `session`, `account`, `verification`.

Other DB scripts: `db:seed`, `db:seed:images`, `db:push`, `db:generate`, `db:migrate`, `db:studio`.

## Attachments

Two sources feed an artefact's `file_urls`:

**Seed files (legacy).** The original export's files live under `static/artefacts/`
(served by SvelteKit at `/artefacts/...`). Each `fileUrls` entry in
`src/lib/data/seed-data.json` was rewritten to its local path, e.g.
`/artefacts/July 2021 Events Menu.webp`.

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
  draft-session cookie (`src/lib/server/drafts.ts`), the visitor's identity for
  uploading; it writes for as long as their access pass is open. Uploads land in
  that draft's own `submissions/<draft>/` space; only it can delete from there, and
  a submission can only attach images from there. A re-tap renews the same draft,
  so a visitor whose pass ran out mid-form loses nothing.
- **Rate limits** backed by the `rate_limit` table (`src/lib/server/rateLimit.ts`).
- **A daily sweep** (`netlify/functions/sweep-submissions.mts` →
  `/api/cron/sweep-submissions`) that deletes abandoned uploads and stale counters
  (see [Sweeps](#sweeps)).

After submitting, a contributor may optionally leave a name or email for the
keepers (`submission_contact`, or `image_set_contact` for photographs; never
published).

Photographs are the archive's other attachment: see [Photographs](#photographs).

### Storage (R2 in prod, RustFS in dev)

Scans and photographs share one bucket. `scans.ts` speaks the S3 API, so the
same code targets two backends via env:

| Env var                | Prod (R2)                         | Local dev (RustFS)                  |
| ---------------------- | --------------------------------- | ----------------------------------- |
| `R2_ACCESS_KEY_ID`     | R2 API token access key           | `rustfsadmin`                       |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret               | `rustfsadmin`                       |
| `R2_BUCKET`            | bucket name                       | `tag-archive`                       |
| `R2_PUBLIC_URL`        | bucket public URL (`pub-…r2.dev`) | injected by the run script          |
| `S3_ENDPOINT`          | _(unset)_ → derived from account  | injected by the run script (RustFS) |
| `S3_REGION`            | _(unset)_ → `auto`                | `auto`                              |
| `R2_ACCOUNT_ID`        | Cloudflare account id             | _(unset)_                           |
| `S3_UPLOAD_PROXY`      | _(unset; ignored)_                | optional `1`: uploads via the app   |
| `R2_CORS_ORIGINS`      | only for `pnpm storage:cors`      | _(unset)_                           |

- **Prod:** no `S3_ENDPOINT`, so `scans.ts` derives the R2 host from `R2_ACCOUNT_ID`.
  Set all `R2_*` in Netlify → Site settings → Environment variables (`.env.production`
  is **not** read by the deployed site). Credentials are server-only
  (`$env/dynamic/private`) — they never reach the browser.
- **Local:** the run script starts a [RustFS](https://github.com/rustfs/rustfs)
  container (a maintained, S3-compatible object store) and points `S3_ENDPOINT`
  / `R2_PUBLIC_URL` at it, so dev uploads never touch the prod bucket. See below.
- **CORS:** photographs are PUT from the browser straight to the bucket, so it
  needs a CORS rule for the site's origin(s): see [CORS](#cors).

### Photographs

An **image set** is one or several photographs uploaded together, with an
optional description and an optional event. Anyone with an open pass, and
signed-in keepers, add sets at `/contribute/images`: an admin's set lands vetted,
anyone else's waits in the review queue like an artefact
(`/keeper/settings/review/images`). Keepers browse sets at `/keeper/images`,
where admins also edit and delete them; the public page is `/images`.

**How an upload flows** (browser: `src/lib/images/upload.ts`; server:
`src/lib/server/imageUploads.ts`):

1. **Sniff.** The browser reads the file's first bytes and refuses anything but
   JPEG, PNG, WebP, GIF or HEIC before sending a byte.
2. **Upload URL.** `POST /api/images/upload-url` (`object: 'original'`) checks
   the uploader (keeper session, or pass + draft cookie, rate-limited like scans)
   and answers with the object keys, a presigned PUT for the original's exact
   type and byte size (up to 50 MB), and a ticket for step 4.
3. **Original PUT,** straight to the bucket, untouched. It starts at once.
4. **Display copy,** meanwhile: the browser decodes the photo (EXIF orientation
   applied), downscales it to 2560 px on its longest edge and encodes a WebP —
   with the canvas where it can, with a WebAssembly libwebp (`@jsquash/webp`) on
   Safari, whose canvas can't encode WebP. A HEIC file the browser can't decode
   (every browser but Safari) goes through libheif (`heic-to`) first. Both load
   only when needed, and photos are decoded one at a time so a phone's memory
   holds out. Once the WebP's size is known, a second `upload-url` call
   (`object: 'display'`, with the ticket proving the original was issued to this
   caller) gets its PUT URL, and it goes up.
5. **Finalize.** `POST /api/images/finalize` reads both objects back: the
   original must sniff as the type its key names; the display copy must be a WebP
   within 8 MB and 2560 px, carrying no EXIF or XMP. The server then parses the
   original's metadata and records an unattached `image` row. A bad upload is
   deleted; one that hasn't finished landing is kept for a retry. Calling it
   twice answers with the same row. (Each anonymous call re-reads the original
   until it is recorded, so drafts get a daily finalize allowance of their own.)
6. **Save.** The form submits the image ids, and `src/lib/server/imageSets.ts`
   attaches them to the set in one atomic batch.

Why this shape:

- **Netlify caps a function's request body at ~6 MB**, and phone photos run past
  it. So the bytes never pass through a function: the server only issues URLs
  and checks what landed.
- **Declared types are never trusted.** What the browser declares only picks
  which URL to ask for; finalize sniffs the stored bytes, as `/api/scans` does.
- **Exact-size signed PUTs.** Each URL signs `Content-Type` and `Content-Length`
  (`presignPut` in `src/lib/server/scans.ts`), so the bucket refuses a body of
  any other size or type: a URL issued for a 3 MB photo can't carry 5 GB, nor
  store HTML on the public host. That is why each photo asks twice — the display
  copy's size is only known once it is encoded. URLs lapse after 5 minutes.

**What is kept, and what is public:**

| Kept                                                    | Where                                   | Public                                                   |
| ------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------- |
| The original, bit-for-bit (its metadata intact)         | `…images/<uuid>/original.<ext>`         | Not listed anywhere public; reachable by its URL (below) |
| A WebP display copy (≤ 2560 px, no metadata)            | `…images/<uuid>/display.webp`           | Yes: what every page shows                               |
| Parsed metadata (EXIF, GPS, XMP, IPTC), as JSON ≤ 64 KB | `image.metadata`                        | Never                                                    |
| Capture time and UTC offset                             | `image.captured_at` / `captured_offset` | Only the day                                             |

`…` is empty for a keeper's upload and `submissions/<draft>/` for a
contributor's. `/api/dataset` builds each photograph from an explicit field
whitelist (`id`, `url`, `width`, `height`, `capturedDate`), so originals and
metadata never reach it. But the bucket is public: an original stays reachable
by its direct, unguessable URL, the same accepted limit as scans (see
[Access](#access)).

**Metadata parsing** (`src/lib/server/imageMetadata.ts`) treats every original
as hostile, since anyone with a pass can upload one. exifr decodes the tags, but
several of exifr 7.1.3's own readers aren't safe on such input (its XMP parser
can write onto `Object.prototype`, its HEIF and ICC readers can spin forever,
its PNG reader inflates without limit). So the module walks the containers
(JPEG, PNG, WebP, HEIF) itself, with every length checked and every loop capped,
and hands exifr only bounded blocks. Parsing never throws: an unreadable file
just yields an undated photograph.

**Dates.** A set's `date` is the earliest day any of its photographs was taken —
the day the camera's clock showed, no time zone applied — recomputed whenever
its photographs change, or NULL when none records one. An admin can set it by
hand on the edit page (`date_auto` off), and switch back to following the
photographs.

#### Sweeps

Removing a photograph from the uploader before saving deletes it at once
(`DELETE /api/images/[id]`); one dropped from a saved set goes when the set is
saved; deleting or rejecting a set deletes its photographs' objects. The rest is
the daily sweep's (`/api/cron/sweep-submissions`, `src/lib/server/uploads.ts`),
which touches only what is more than a day old:

- **Unattached rows** (`sweepUnattachedImages`): photographs finalized but never
  saved into a set — a form closed without submitting. Rows first, then their
  objects.
- **Abandoned submissions** (`sweepAbandonedSubmissions`): objects under
  `submissions/` that nothing uses — a contributor's scans and photographs from a
  form never submitted.
- **Orphan objects** (`sweepOrphanObjects`): keepers' photograph objects under
  `images/` that no row records — an upload that never reached finalize, or
  objects whose delete failed.

"Used" means named by an artefact's `file_urls` or by any `image` row's `url` or
`original_url`, attached or not, matched by bucket key rather than full URL (so a
change of `R2_PUBLIC_URL` never makes the archive look unused). Each sweep
removes at most 500 rows or objects a run. The route answers `{ images,
unattachedImages, orphanObjects, counters }` (`images` counts the abandoned
submissions); a step that failed is `null`, and the answer a 500.

#### CORS

The browser PUTs to the bucket's own host, so the bucket must allow the page's
origin.

**Production (R2).** The rule lives in `scripts/r2-cors.mjs`: `PUT` and `GET`,
the `content-type` header, `ETag` exposed, preflights cached for an hour. Apply
it from your machine with wrangler (a devDependency):

```sh
pnpm exec wrangler login        # once, or set CLOUDFLARE_API_TOKEN
export R2_BUCKET=<bucket> R2_CORS_ORIGINS=https://tag-archive.netlify.app
pnpm storage:cors --dry-run     # print the rule as JSON, apply nothing
pnpm storage:cors               # apply it, then list what R2 now holds
```

`R2_CORS_ORIGINS` is comma-separated; list every origin pages are served from
(the Netlify site and any custom domain). The script reads the shell's
environment only, never `.env` (whose `ORIGIN` and `R2_BUCKET` are the dev
site's). When `R2_CORS_ORIGINS` is unset, an exported `ORIGIN` stands in, unless
it is `.env`'s or a local address. The script replaces the bucket's whole CORS
configuration. **R2 can't wildcard subdomains**, so a deploy preview
(`https://deploy-preview-<n>--tag-archive.netlify.app`) can't upload photographs
unless its exact origin is added and the rule re-applied; the rest of a preview
works. Without the rule, every photograph fails with "The upload was
interrupted" and the browser console shows a CORS error.

**Local (RustFS).** `scripts/init-bucket.mjs` gives the dev bucket a wide-open
rule at boot, and the app re-applies it whenever it recreates a lost bucket. If
the store refuses it (init-bucket warns), or you're testing from a phone that
can't reach the store's `127.0.0.1`, set `S3_UPLOAD_PROXY=1` in `.env`: the
browser then PUTs to `/api/images/put` in the dev server, held to the same
signed terms. It only works under `vite dev` with a local store.

**Checking a deploy** (after changing the rule or the site's domain):

1. `pnpm exec wrangler r2 bucket cors list <bucket>` names the site's origin(s).
2. On the live site, add a photograph at `/contribute/images`. In DevTools →
   Network, the cross-origin `PUT`s to `<account>.r2.cloudflarestorage.com`
   and their `OPTIONS` preflights succeed, and `finalize` answers 200.
3. The display copy renders through the image CDN: on the site, open
   `/.netlify/images?url=<the display.webp URL>&w=400`. If that answers with an
   error rather than the image, check that the bucket's public host is in
   `[images] remote_images` in `netlify.toml`.
4. Once the set is vetted, `/api/dataset` lists it with only `id`, `url`,
   `width`, `height` and `capturedDate` per photograph.

## Access

The whole site opens only to people in the garden. An NXP **NTAG 424 DNA** tag
there rewrites its URL on every tap (Secure Dynamic Messaging): `e` carries the
tag's UID and tap counter, AES-encrypted, and `c` a MAC over them. `GET /t`
(`src/routes/t/+server.ts`) verifies the MAC (`src/lib/server/nfc/sdm.ts`), accepts
the tap only if its counter beats every one this tag has sent before (the `nfc_tag`
table, `src/lib/server/nfc/taps.ts` — so a copied URL can't be replayed), then sets
a signed **access pass** cookie (`src/lib/access/pass.ts`) and redirects to `/`.

The pass is good for 20 minutes and **slides while the site is on screen**: the
root layout beats `POST /api/presence` (`src/lib/access/presence.ts`,
`src/routes/api/presence/+server.ts`) every four minutes while the page is visible,
once more as it goes hidden (`sendBeacon`), and again the moment it is back; each
beat re-mints the pass for another 20 minutes. So the archive drifts shut 20 minutes
after it was last on the visitor's screen — screen lock, app switch and closing the
browser all count as away. The clock is the server's, inside the signed cookie: a
backgrounded mobile tab cannot be trusted to run one. The beat is the only place a
pass slides; nothing else sets the cookie on a response the CDN might cache.

The pass is checked twice, from one rule (`src/lib/access/gate.ts`):

- **At the edge** (`netlify/edge-functions/access-gate.ts`), in front of the CDN —
  the only layer that sees static scans and audio and cached responses like
  `/api/dataset`, none of which ever reach SvelteKit.
- **In `hooks.server.ts`**, for everything SvelteKit serves — and the only gate
  under `vite dev`, which doesn't run edge functions.

Without a pass, a page view lands on `/locked`; anything else gets a 401. Always
open: `/t`, `/locked`, the sign-in endpoints (`/api/auth/*`), the cron endpoint,
and the app bundles and decor the locked page is drawn with.

**Keepers bypass the tag.** The sign-in page is locked like everything else,
except through its door: `/keeper?listeningwith=thevoiceofthegarden`, the link
keepers bookmark (`src/lib/access/keeperDoor.server.ts`; server-only, so the
phrase never ships in the browser bundle). A signed-in keeper who holds no pass is
handed one on their next page view, and the same beat keeps it sliding, so a keeper
is never locked out for being away. The signed-in area
(`/keeper/*`) stays open at the gate so a keeper whose pass has lapsed still
reaches SvelteKit, where their session renews it; anyone without a session is
sent back to `/keeper`.

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
6. Tap it with a phone: you should land on `/` with an "Archive opened" note, and the
   URL should change with every tap.

Taps register their tag automatically (only a holder of the keys can produce a
valid one). To retire a lost tag, set its `revoked_at` in the `nfc_tag` table
(Drizzle Studio).

Known limits, accepted for now: scans and photographs uploaded to R2 (originals
included) stay reachable by their direct (random, unguessable) URL; search
engines see only `/locked`; and an iPhone opens the tapped link in a new Safari
tab — a `/locked` tab left open moves on by itself when the visitor returns to
it.

## Conductor

`.conductor/settings.toml` defines the workspace lifecycle:

- **Setup** (on workspace create): `pnpm install && pnpm db:setup:local`
- **Run** (`dev`, the default 🚀 button): starts DB + RustFS + Studio + site
  together via `concurrently`
  - `db` → `turso dev` serving `local.db` on `CONDUCTOR_PORT+1`
  - `rustfs` → RustFS S3 store on `CONDUCTOR_PORT+2` (dev stand-in for R2);
    `scripts/init-bucket.mjs` creates the bucket + public-read policy + CORS rule
    on boot.
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
and photograph uploads disabled) instead of failing.

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
pnpm dev:storage:init  # create the bucket + public-read policy + CORS (once RustFS is up)
DATABASE_URL=http://127.0.0.1:8081 \
  S3_ENDPOINT=http://127.0.0.1:9000 \
  R2_PUBLIC_URL=http://127.0.0.1:9000/tag-archive pnpm dev   # the site
```

Not exercising uploads? Run `pnpm dev:db` + `DATABASE_URL=http://127.0.0.1:8081 pnpm dev`.

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
