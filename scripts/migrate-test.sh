#!/usr/bin/env bash
# Faithful pre-merge migration gate. Reproduces the two PROD conditions that
# local `turso dev` cannot:
#
#   1. ENGINE. Runs libsql-server (sqld) — the libSQL C fork that Turso Cloud
#      runs — NOT `turso dev` (v1.x is the from-scratch Rust "Turso Database"
#      engine, which doesn't enforce the same rules). Only libSQL raises e.g.
#      "Cannot add a column with non-constant default".
#
#   2. DATA. That check (and others) fires ONLY when the target table has rows.
#      An empty-DB replay passes on every engine. So we migrate + seed the BASE
#      (origin/main) state first, THEN apply the branch's pending migrations
#      against POPULATED tables — exactly how prod hits them.
#
# Requires Docker (libsql-server image) + git. Run in CI (DB Migrate Check) and
# locally via `pnpm db:migrate:test`. Override the baseline with BASE_REF.
set -euo pipefail

BASE_REF="${BASE_REF:-origin/main}"
IMAGE="ghcr.io/tursodatabase/libsql-server:latest"
NAME="libsql-gate-$$"
WORKTREE=".migrate-base"

cleanup() {
	docker rm -f "$NAME" >/dev/null 2>&1 || true
	git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
	rm -rf "$WORKTREE"
}
trap cleanup EXIT

docker rm -f "$NAME" >/dev/null 2>&1 || true

# `-p 127.0.0.1::8080` lets Docker pick a free host port → no collisions between
# parallel workspaces / CI jobs. Ephemeral (no volume): data lives for the
# container's lifetime, which spans this whole script.
docker run -d --rm --name "$NAME" -p 127.0.0.1::8080 "$IMAGE" >/dev/null
HOST_PORT="$(docker port "$NAME" 8080/tcp | head -1 | sed 's/.*://')"
export DATABASE_URL="http://127.0.0.1:${HOST_PORT}"

# Wait until sqld accepts connections.
for _ in $(seq 1 60); do
	curl -s -o /dev/null "${DATABASE_URL}/health" && break
	sleep 0.5
done

# Baseline (prod-like) state: schema + rows. The worktree is NESTED under the
# repo root and gitignored, so Node resolves its imports (drizzle-orm, @libsql)
# against the root node_modules — no second install needed. --detach avoids
# creating a branch.
git worktree add --detach --force "$WORKTREE" "$BASE_REF" >/dev/null
echo "[migrate-test] baseline ${BASE_REF}: migrate + seed"
pnpm exec tsx "$WORKTREE/src/lib/server/db/migrate.ts"
pnpm exec tsx "$WORKTREE/src/lib/server/db/seed.ts"

# The branch's PENDING migrations, applied on top of the populated baseline.
# The migrator skips already-recorded baseline migrations (identical hashes) and
# runs only the new ones — against tables that now hold rows.
echo "[migrate-test] applying pending migrations against populated tables"
pnpm db:migrate
