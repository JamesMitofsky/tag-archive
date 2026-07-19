# Data Portability

> Drafted by AI, human validated

For a developer coming to this project cold: what external services it depends on, how much each one locks you in, and what it takes to move off each one safely.

The guiding principle here is good: nearly every dependency speaks a **standard protocol** (SQLite, the S3 API, SMTP-class email), so "getting off" a vendor is almost always a matter of re-pointing a URL and re-uploading data — not a rewrite. The two exceptions (the Netlify build adapter and the domain registrar) are called out explicitly.

## Stack at a glance

| Concern | Vendor | What speaks to it | Lock-in |
|---|---|---|---|
| Hosting + CD | **Netlify** | `@sveltejs/adapter-netlify` | Low |
| DNS | **Netlify** (DNS) | nameservers | Low |
| Domain registrar | **Namecheap** | — | Low |
| Database | **Turso** (libSQL) | `drizzle-orm` + `@libsql/client` | Low |
| Object storage | **Cloudflare R2** | `aws4fetch` (S3 API) | Low |
| Transactional email | **Resend** | `src/lib/server/email` | Very low |
| Auth | **Better Auth** (self-hosted lib) | `better-auth` | None (data lives in our DB) |

Everything is configured through **environment variables** — no vendor SDK is hardwired into business logic. See `.env.example` for the full list. That is the single most important portability fact about this codebase: swapping a provider is mostly an env change plus a data copy.

---

## 1. Netlify — Hosting, CD, and DNS

**What it does.** Builds the SvelteKit app on every push (CD is Git-driven), serves it as SSR via serverless functions, and also acts as the DNS provider for the domain.

**Where the coupling lives.**
- `svelte.config.js` → `adapter: adapter()` from `@sveltejs/adapter-netlify`. This is the one piece of real Netlify-specific code — it shapes the build output into Netlify Functions.
- `netlify.toml` → only sets `NODE_VERSION`. Trivial.
- Production env vars (R2 keys, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `BETTER_AUTH_SECRET`, `RESEND_*`, `ORIGIN`) are set in **Netlify → Site settings → Environment variables**, NOT in the repo. The `.env.production` file is loaded only by local `vite build`/`preview`; the live deploy does not read it.

**Getting off safely.**
1. Swap the adapter for the target platform's: `adapter-vercel`, `adapter-cloudflare`, or `adapter-node` (for any VPS/container). One-line change in `svelte.config.js` + `pnpm remove @sveltejs/adapter-netlify && pnpm add <new-adapter>`.
2. Re-create every environment variable on the new host. **This is the step that silently breaks things** — a missing `DATABASE_AUTH_TOKEN` or `BETTER_AUTH_SECRET` produces a booting-but-broken site. Copy the full list from Netlify's env panel before you start; treat `.env.example` as the checklist.
3. `adapter-node` is the true escape hatch — it produces a plain Node server that runs anywhere, ending all host lock-in at the cost of managing your own runtime.

**DNS note.** Netlify is also the DNS provider. Moving hosting does **not** require moving DNS — you can keep Netlify DNS and just point records at the new host. If you move DNS too, export the zone records first (A/AAAA/CNAME/MX/TXT) so email and subdomains don't drop.

**Lock-in verdict:** Low–Medium. The adapter is the only code change; env-var re-entry is the real risk.

---

## 2. Namecheap — Domain registrar

**What it does.** Sells and holds the domain registration. Separate from DNS (which Netlify runs) and from hosting.

**Getting off safely.**
1. Unlock the domain in Namecheap and request the **EPP/auth transfer code**.
2. Initiate an inbound transfer at the new registrar; confirm via the admin-contact email.
3. **Do this well before renewal** — transfers can take up to ~5 days and are blocked in the 60 days after registration or a prior transfer.
4. Before transferring, confirm where DNS is authoritative (Netlify). As long as the nameservers stay pointed at Netlify through the move, the site and email keep resolving — registrar and DNS are independent.

**Lock-in verdict:** Low. Domains are a portable commodity; ICANN mandates transferability. The only risk is timing and losing access to the admin email.

---

## 3. Turso (libSQL) — Database

**What it does.** Hosts the production database. Turso is **hosted SQLite** (libSQL is a SQLite fork), reached over an HTTP/libSQL URL.

**Where the coupling lives.**
- `src/lib/server/db/index.ts` → `createClient({ url, authToken })` from `@libsql/client`, wrapped by `drizzle-orm/libsql`.
- `drizzle.config.ts` → `dialect: 'turso'`.
- Config is entirely `DATABASE_URL` + `DATABASE_AUTH_TOKEN`. Local dev points the same code at a `turso dev` server or a raw `file:local.db` — proof the app is not bound to Turso's cloud.

**Getting off safely.** Two tiers:
1. **Any SQLite host / a file on disk.** Because it's plain SQLite, `turso db dump` (or copying the file) gives you a portable `.db` / SQL dump. Point `DATABASE_URL` at `file:...` or another libSQL server and the app runs unchanged. This is the low-effort path and the reason DB lock-in is minimal.
2. **A different engine (Postgres/MySQL).** Larger job: Drizzle abstracts queries, but the schema in `src/lib/server/db/schema.ts` uses the SQLite dialect, so you'd regenerate it for the new dialect, change `drizzle.config.ts`, swap the client, and migrate the data. Do this only if you outgrow SQLite's single-writer model.

**Data export drill (do this regularly regardless).** Schedule `turso db dump` (or equivalent) to a backup location. A dump is the disaster-recovery artifact and the migration artifact at once — the whole DB is one portable file.

**Lock-in verdict:** Low. It's SQLite; the data is a file and Drizzle shields most query code.

---

## 4. Cloudflare R2 — Object storage (scan images)

**What it does.** Stores uploaded scan images. R2 is **S3-compatible**.

**Where the coupling lives.**
- Accessed via `aws4fetch` (a generic S3 request signer), NOT a Cloudflare SDK. The code talks the **S3 API**, not an R2-specific one.
- Config: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, `S3_REGION`, and `S3_ENDPOINT`. Local dev points the exact same code at a **RustFS** container (`pnpm dev:storage`) — again proving no R2-specific dependency.

**Getting off safely.**
1. Pick any S3-compatible target: AWS S3, Backblaze B2, MinIO/RustFS self-hosted, Wasabi, etc.
2. Copy the objects: `rclone sync r2:tag-archive newremote:tag-archive` (rclone speaks S3 to both ends) or `aws s3 sync`.
3. Update the `R2_*` / `S3_ENDPOINT` / `R2_PUBLIC_URL` env vars to the new bucket. No code change — `aws4fetch` signs for whatever endpoint you give it.
4. **Watch the public URL.** `R2_PUBLIC_URL` is stored/derived for serving images. After migration, confirm objects are publicly readable at the new host and that any URLs persisted in the DB still resolve (you may need a redirect or a DB update if URLs were stored absolute).

**Lock-in verdict:** Low. Standard S3 API + a portable object copy.

---

## 5. Resend — Transactional email (login OTP)

**What it does.** Delivers one-time login codes for Better Auth's email-OTP flow.

**Where the coupling lives.**
- Isolated behind `src/lib/server/email` (`sendOtpEmail`), called from `src/lib/server/auth.ts`.
- Config: `RESEND_API_KEY`, `RESEND_FROM`. If `RESEND_API_KEY` is unset, OTP codes are **logged to the server console** instead — so local dev needs no email vendor at all.

**Getting off safely.** Rewrite the one `send` function in `src/lib/server/email` to call the new provider (Postmark, SES, SMTP, etc.), swap the env vars. Nothing else references the provider. Then **re-verify your sending domain** (SPF/DKIM/DMARC) with the new provider or deliverability silently degrades.

**Lock-in verdict:** Very low. One function, one env var pair, well-isolated.

---

## 6. Better Auth — Authentication

**What it does.** Handles sessions, the admin/contributor roles, and email-OTP login. It is a **self-hosted library**, not a SaaS — there is no auth vendor to leave.

**Where the data lives.** In our own database, via `drizzleAdapter(db, { provider: 'sqlite' })`. User, session, and account tables are part of the same Turso/SQLite DB covered in §3, so they travel with the database dump. The auth schema is generated to `src/lib/server/db/auth.schema.ts` (regenerate with `pnpm auth:schema`).

**Portability notes.**
- `BETTER_AUTH_SECRET` must be preserved across any host move or **all existing sessions invalidate** (users get logged out — not fatal, but surprising). Treat it like a database credential.
- Because auth state is just rows in our DB, migrating the database migrates the users. No separate export.

**Lock-in verdict:** None (vendor); the only care item is carrying `BETTER_AUTH_SECRET` and the DB together.

---

## Migration checklist (condensed)

Ordered so the site never goes dark:

1. **Back up first.** `turso db dump` (DB, incl. all users/sessions) + `rclone sync` the R2 bucket. Save `.env` / Netlify env vars.
2. **Database:** stand up the new libSQL/SQLite host, load the dump, update `DATABASE_URL` + `DATABASE_AUTH_TOKEN`.
3. **Storage:** copy the bucket to the new S3-compatible target, update `R2_*` / `S3_ENDPOINT` / `R2_PUBLIC_URL`, verify public reads.
4. **Email:** repoint `src/lib/server/email`, re-verify the sending domain.
5. **Host:** swap the SvelteKit adapter, re-enter every env var (use `.env.example` as the checklist), carry `BETTER_AUTH_SECRET` verbatim.
6. **DNS:** point records at the new host (keep or move Netlify DNS — independent of hosting).
7. **Registrar:** transfer the domain from Namecheap only when unrelated to an outage; allow ~5 days.
8. **Verify:** login (OTP delivers), image loads (R2 URLs resolve), existing sessions behave, admin role intact.

**The one rule that prevents most portability pain:** never let a secret or a data blob live *only* at a vendor. The DB is a file, the bucket is copyable, and every credential is enumerated in `.env.example`. Keep current backups of all three and no single vendor can strand this project.
